import { buildSystemPrompt } from '@/lib/ai/prompts';
import {
  extractTextContent,
  toVercelChatMessages,
} from '@/lib/ai/message-utils';
import llmConfig from '@/lib/models/llm-config';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import FirecrawlApp, { type ScrapeResponse } from '@mendable/firecrawl-js';
import PostHogClient from '@/app/posthog';
import type { ChatMetadata, LLMID, ModelParams } from '@/types';
import {
  generateTitleFromUserMessage,
  handleFinalChatAndAssistantMessage,
} from '@/lib/ai/actions';
import { truncateContentByTokens } from '@/lib/ai/terminal-utils';
import type { Doc } from '@/convex/_generated/dataModel';
import { tool } from 'ai';
import { z } from 'zod';

interface BrowserToolConfig {
  profile: any;
  chat: Doc<'chats'> | null;
  messages: any[];
  modelParams: ModelParams;
  dataStream: any;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  userCountryCode: string | null;
  initialChatPromise: Promise<void>;
  assistantMessageId: string;
}

async function getProviderConfig(profile: any) {
  const systemPrompt = buildSystemPrompt(
    llmConfig.systemPrompts.pentestGPTBrowser,
    profile.profile_context,
  );

  return {
    systemPrompt,
    model: myProvider.languageModel('chat-model-small'),
  };
}

export function getLastUserMessage(messages: any[]): string {
  return (
    messages.findLast((msg) => msg.role === 'user')?.content || 'Unknown query'
  );
}

export async function browsePage(
  url: string,
  format: 'markdown' | 'html' = 'markdown',
  userCountryCode: string | null = null,
): Promise<string> {
  try {
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

    // First try with default proxy
    const scrapeResult = (await app.scrapeUrl(url, {
      formats: ['markdown', 'html'],
      location: {
        country: userCountryCode || 'US',
      },
      timeout: 15000,
    })) as ScrapeResponse;

    // Check if we got an error status code that warrants stealth retry
    const statusCode = scrapeResult?.metadata?.statusCode;
    if (statusCode && [401, 403, 500].includes(statusCode)) {
      // Retry with stealth proxy
      const stealthResult = (await app.scrapeUrl(url, {
        formats: ['markdown', 'html'],
        location: {
          country: userCountryCode || 'US',
        },
        proxy: 'stealth',
        timeout: 20000,
      })) as ScrapeResponse;

      if (!stealthResult.success) {
        return `Error fetching URL: ${url}. Error: ${stealthResult.error}`;
      }

      const content =
        format === 'markdown'
          ? (stealthResult as any).markdown
          : (stealthResult as any).html;

      if (!content) {
        return `Error: Empty content received from URL: ${url}`;
      }

      return truncateContentByTokens(content);
    }

    if (!scrapeResult.success) {
      return `Error fetching URL: ${url}. Error: ${scrapeResult.error}`;
    }

    const content =
      format === 'markdown'
        ? (scrapeResult as any).markdown
        : (scrapeResult as any).html;

    if (!content) {
      return `Error: Empty content received from URL: ${url}`;
    }

    return truncateContentByTokens(content);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return `Error browsing URL: ${url}. ${errorMessage}`;
  }
}

export function createBrowserPrompt(
  browserResult: string,
  url: string,
  lastUserMessage?: string,
): string {
  return `You have just browsed a webpage. The content you found is enclosed below:

<webpage>
<source>${url}</source>
<webpage_content>${browserResult}</webpage_content>
</webpage>

${
  lastUserMessage
    ? `The user has the following query about this webpage:

<user_query>
${lastUserMessage}
</user_query>
`
    : ''
}
With the information from the webpage content above, \
respond to the user's query as if you have comprehensive knowledge of the page. \
Provide a direct and insightful answer to the query. \
If the specific details are not present, draw upon related information to \
offer valuable insights or suggest practical alternatives. \
If the webpage content is empty, irrelevant, or indicates an error, \
clearly state that you couldn't access the information and explain why.

Important: Do not refer to "the webpage content provided" or "the information given" in your response. \
Instead, answer as if you have directly attempted to view the webpage and are sharing your experience with it.`;
}

export async function executeBrowserTool({
  open_url,
  format_output,
  config,
}: {
  open_url: string;
  format_output: 'markdown' | 'html';
  config: BrowserToolConfig;
}) {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error(
      'FIRECRAWL_API_KEY is not set in the environment variables',
    );
  }

  const {
    profile,
    chat,
    messages,
    modelParams,
    dataStream,
    chatMetadata,
    userCountryCode,
    abortSignal,
    initialChatPromise,
    assistantMessageId,
  } = config;
  const { systemPrompt, model } = await getProviderConfig(profile);

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'browser_executed',
    });
  }

  try {
    const message =
      messages.find((m: { role: string }) => m.role === 'user') ||
      messages[messages.length - 1];
    const lastUserMessage = extractTextContent(message.content);
    dataStream.writeData({ type: 'tool-call', content: 'browser' });

    const browserResult = await browsePage(
      open_url,
      format_output,
      userCountryCode,
    );
    const browserPrompt = createBrowserPrompt(
      browserResult,
      open_url,
      lastUserMessage,
    );

    let generatedTitle: string | undefined;
    let titleGenerationPromise: Promise<void> | null = null;

    // Start title generation if needed
    if (chatMetadata.id && !chat) {
      titleGenerationPromise = (async () => {
        generatedTitle = await generateTitleFromUserMessage({
          messages,
          abortSignal: config.abortSignal,
        });
        dataStream.writeData({ chatTitle: generatedTitle });
      })();
    }

    const { fullStream } = streamText({
      model: myProvider.languageModel('browser-model'),
      providerOptions: {
        openai: {
          store: false,
        },
      },
      system: systemPrompt,
      messages: [
        ...toVercelChatMessages(messages.slice(0, -1)),
        { role: 'user', content: browserPrompt },
      ],
      maxTokens: 4096,
      abortSignal,
      onError: async (error) => {
        console.error('[BrowserTool] Stream Error:', error);
      },
      onFinish: async ({
        finishReason,
        text,
      }: {
        finishReason: string;
        text: string;
      }) => {
        // Wait for both title generation and initial chat handling to complete
        await Promise.all([titleGenerationPromise, initialChatPromise]);

        await handleFinalChatAndAssistantMessage({
          modelParams,
          chatMetadata,
          profile,
          model: config.model,
          chat,
          finishReason,
          title: generatedTitle,
          assistantMessage: text,
          assistantMessageId,
        });
      },
    });

    const citations: string[] = [];
    let hasFirstTextDelta = false;

    for await (const delta of fullStream) {
      if (delta.type === 'source') {
        if (delta.source.sourceType === 'url') {
          citations.push(delta.source.url);
        }
      }

      if (delta.type === 'text-delta') {
        if (!hasFirstTextDelta) {
          // Send citations after first text-delta
          dataStream.writeData({ citations });
          hasFirstTextDelta = true;
        }

        dataStream.writeData({
          type: 'text-delta',
          content: delta.textDelta,
        });
      }
    }

    return 'Browser tool executed';
  } catch (error) {
    console.error('[BrowserTool] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      model,
    });
    dataStream.writeData({
      type: 'text-delta',
      content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    return 'Browser tool executed with errors';
  }
}

export async function getPageContent(
  url: string,
  format: 'markdown' | 'html' = 'markdown',
): Promise<string> {
  try {
    const browserResult = await browsePage(url, format);
    const browserPrompt = createBrowserPrompt(browserResult, url);
    return browserPrompt;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return `Error getting page content: ${url}. ${errorMessage}`;
  }
}

/**
 * Browser tool using Jina AI Reader API
 * Opens a URL and extracts its content
 */
export const createBrowserTool = (profile: any) => {
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
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const content = await response.text();

        // Truncate content to max 4096 tokens
        const truncatedContent = truncateContentByTokens(content, 8096);

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
