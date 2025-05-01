import { buildSystemPrompt } from '@/lib/ai/prompts';
import { toVercelChatMessages } from '@/lib/ai/message-utils';
import llmConfig from '@/lib/models/llm-config';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import FirecrawlApp, { type ScrapeResponse } from '@mendable/firecrawl-js';
import PostHogClient from '@/app/posthog';
import type { ChatMetadata, LLMID } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateTitleFromUserMessage,
  handleChatWithMetadata,
} from '@/lib/ai/actions';
import { truncateContentByTokens } from '@/lib/ai/terminal-utils';

interface BrowserToolConfig {
  profile: any;
  messages: any[];
  dataStream: any;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
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
): Promise<string> {
  try {
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
    const scrapeResult = (await app.scrapeUrl(url, {
      formats: ['markdown', 'html'],
    })) as ScrapeResponse;

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

    // Check if the error message contains HTTP status codes we want to skip logging
    if (
      !errorMessage.includes('408') &&
      !errorMessage.includes('403') &&
      !errorMessage.includes('500') &&
      !errorMessage.includes('400')
    ) {
      console.error('[BrowserTool] Error browsing URL:', url, error);
    }

    return `Error browsing URL: ${url}. ${errorMessage}`;
  }
}

export async function browseMultiplePages(
  urls: string[],
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const urlsToProcess = urls.slice(0, 3);

  try {
    await Promise.all(
      urlsToProcess.map(async (url) => {
        try {
          const content = await browsePage(url);
          results[url] = content;
        } catch (error) {
          console.error(`[BrowserTool] Error browsing URL: ${url}`, error);
          results[url] =
            `Error accessing URL: ${url}. ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }),
    );
  } catch (error) {
    console.error('[BrowserTool] Error in browseMultiplePages:', error);
    // If there's an error in Promise.all, mark all URLs as failed
    urlsToProcess.forEach((url) => {
      results[url] =
        `Error: Failed to process URL: ${url}. ${error instanceof Error ? error.message : 'Unknown error'}`;
    });
  }

  return results;
}

export function createBrowserPrompt(
  browserResult: string,
  lastUserMessage: string,
  url: string,
): string {
  return `You have just browsed a webpage. The content you found is enclosed below:

<webpage>
<source>${url}</source>
<webpage_content>${browserResult}</webpage_content>
</webpage>

The user has the following query about this webpage:

<user_query>
${lastUserMessage}
</user_query>

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

export function createMultiBrowserPrompt(
  browserResults: Record<string, string>,
  lastUserMessage: string,
): string {
  const webpageContentSections = Object.entries(browserResults)
    .map(
      ([url, content]) => `<webpage>
<source>${url}</source>
<webpage_content>${content}</webpage_content>
</webpage>`,
    )
    .join('\n\n');

  return `You have just browsed multiple webpages. The content you found is enclosed below:

${webpageContentSections}

The user has the following query about these webpages:

<user_query>
${lastUserMessage}
</user_query>

With the information from the webpage contents above, \
respond to the user's query as if you have comprehensive knowledge of the pages. \
Provide a direct and insightful answer to the query. \
If the specific details are not present, draw upon related information to \
offer valuable insights or suggest practical alternatives. \
If any webpage content is empty, irrelevant, or indicates an error, \
clearly state that you couldn't access the information and explain why.

Important: Do not refer to "the webpage content provided" or "the information given" in your response. \
Instead, answer as if you have directly attempted to view the webpages and are sharing your experience with them.`;
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

  const { profile, messages, dataStream, chatMetadata, supabase } = config;
  const { systemPrompt, model } = await getProviderConfig(profile);

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'browser_executed',
      properties: {
        model: model,
      },
    });
  }

  try {
    const lastUserMessage = getLastUserMessage(messages);
    dataStream.writeData({ type: 'tool-call', content: 'browser' });

    const browserResult = await browsePage(open_url, format_output);
    const browserPrompt = createBrowserPrompt(
      browserResult,
      lastUserMessage,
      open_url,
    );

    let generatedTitle: string | undefined;

    await Promise.all([
      (async () => {
        const { fullStream } = streamText({
          model,
          system: systemPrompt,
          messages: [
            ...toVercelChatMessages(messages.slice(0, -1)),
            { role: 'user', content: browserPrompt },
          ],
          maxTokens: 2048,
          onError: async (error) => {
            console.error('[BrowserTool] Stream Error:', error);
          },
          onFinish: async ({ finishReason }: { finishReason: string }) => {
            if (supabase) {
              await handleChatWithMetadata({
                supabase,
                chatMetadata,
                profile,
                model: config.model,
                title: generatedTitle,
                messages,
                finishReason,
              });
            }
          },
        });

        for await (const delta of fullStream) {
          if (delta.type === 'text-delta') {
            dataStream.writeData({
              type: 'text-delta',
              content: delta.textDelta,
            });
          }
        }
      })(),
      (async () => {
        if (chatMetadata.id && chatMetadata.newChat) {
          generatedTitle = await generateTitleFromUserMessage({
            messages,
            abortSignal: config.abortSignal,
          });
          dataStream.writeData({ chatTitle: generatedTitle });
        }
      })(),
    ]);

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
