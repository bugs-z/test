import PostHogClient from '@/app/posthog';
import { truncateContentByTokens } from '@/lib/ai/terminal-utils';
import { tool } from 'ai';
import { z } from 'zod';

export function getLastUserMessage(messages: any[]): string {
  return (
    messages.findLast((msg) => msg.role === 'user')?.content || 'Unknown query'
  );
}

/**
 * Browser tool using Jina AI Reader API
 * Opens a URL and extracts its contentNP
 */
export const createBrowserTool = (
  profile: any,
  abortSignal: AbortSignal,
  dataStream: any,
) => {
  return tool({
    description: `Use the browser tool to open a specific URL and extract its content. \
Some examples of when to use the browser tool include:
- When the user explicitly requests to visit, open, browse, or view a specific webpage or URL.
- When the user directly instructs you to access a specific website they've mentioned.
- When performing security testing, vulnerability assessment, or penetration testing of a website.

Do not use browser tool for general information queries that can be answered without visiting a URL.
Do not use browser tool if the user merely mentions a URL without explicitly asking you to open it.
The browser tool cannot access IP addresses (like http://192.168.1.1), or non-standard URLs.`,
    parameters: z.object({
      open_url: z.string().describe('The URL of the webpage to open'),
    }),
    execute: async ({ open_url }) => {
      try {
        if (!process.env.JINA_API_KEY) {
          throw new Error('JINA_API_KEY environment variable is not set');
        }

        // Track browser usage with PostHog
        const posthog = PostHogClient();
        if (posthog) {
          posthog.capture({
            distinctId: profile.user_id,
            event: 'browser_executed',
          });
        }

        // Construct the Jina AI reader URL
        const jinaUrl = `https://r.jina.ai/${open_url}`;

        // Make the request to Jina AI reader
        const response = await fetch(jinaUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            'X-Engine': 'browser',
            'X-No-Cache': 'true',
            'X-Return-Format': 'markdown',
            'X-Timeout': '30',
          },
          signal: abortSignal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const content = await response.text();

        // Truncate content to max 4096 tokens
        const truncatedContent = truncateContentByTokens(content, 8096);

        dataStream.writeData({ citations: [open_url] });

        return {
          url: open_url,
          content: truncatedContent,
          success: true,
        };
      } catch (error) {
        console.error('Browser tool error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          url: open_url,
          error: `Error accessing webpage: ${errorMessage}`,
          success: false,
        };
      }
    },
  });
};

export default createBrowserTool;
