import {
  toVercelChatMessages,
  validatePerplexityMessages,
} from '@/lib/ai/message-utils';
import PostHogClient from '@/app/posthog';
import type { ChatMetadata, LLMID, ModelParams } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateTitleFromUserMessage,
  handleFinalChatAndAssistantMessage,
} from '@/lib/ai/actions';
import { removePdfContentFromMessages } from '@/lib/build-prompt-backend';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { v4 as uuidv4 } from 'uuid';

interface DeepResearchConfig {
  messages: any[];
  profile: any;
  dataStream: any;
  modelParams: ModelParams;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
  userCountryCode: string | null;
  originalMessages: any[];
  systemPrompt: string;
  initialChatPromise: Promise<void>;
}

// Keepalive interval in milliseconds
const KEEPALIVE_INTERVAL = 30000; // 30 seconds

export async function executeDeepResearchTool({
  config,
}: {
  config: DeepResearchConfig;
}) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('Perplexity API key is not set for deep research');
  }

  const {
    messages,
    profile,
    dataStream,
    modelParams,
    chatMetadata,
    supabase,
    userCountryCode,
    abortSignal,
    model,
    originalMessages,
    systemPrompt,
    initialChatPromise,
  } = config;

  // Filter out PDF content from messages
  const filteredMessages = removePdfContentFromMessages(messages);

  // Validate messages for proper alternating roles
  const validatedMessages = validatePerplexityMessages(filteredMessages);

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'deep_research_executed',
    });
  }

  dataStream.writeData({
    type: 'tool-call',
    content: 'deep-research',
  });

  let generatedTitle: string | undefined;
  const citations: string[] = [];
  let isThinking = false;
  let thinkingStartTime: number | null = null;
  const assistantMessageId = uuidv4();

  // Set up keepalive interval
  const keepaliveInterval = setInterval(() => {
    if (!abortSignal.aborted) {
      dataStream.writeData({
        type: 'keepalive',
        content: '',
      });
    }
  }, KEEPALIVE_INTERVAL);

  try {
    await Promise.all([
      (async () => {
        const result = streamText({
          model: myProvider.languageModel('deep-research-model'),
          system: systemPrompt,
          messages: toVercelChatMessages(validatedMessages),
          maxTokens: 8192,
          experimental_generateMessageId: () => assistantMessageId,
          providerOptions: {
            perplexity: {
              web_search_options: {
                search_context_size: 'medium',
                ...(userCountryCode && {
                  user_location: { country: userCountryCode },
                }),
              },
            },
          },
          onChunk: async (chunk) => {
            if (chunk.chunk.type === 'reasoning') {
              if (!isThinking) {
                isThinking = true;
                thinkingStartTime = Date.now();
              }
            }
          },
          onError: async (error) => {
            console.error('[DeepResearch] Stream Error:', error);
          },
          onFinish: async ({ text, reasoning }) => {
            let thinkingElapsedSecs = null;
            if (isThinking && thinkingStartTime) {
              isThinking = false;
              thinkingElapsedSecs = Math.round(
                (Date.now() - thinkingStartTime) / 1000,
              );
              dataStream.writeData({
                type: 'thinking-time',
                elapsed_secs: thinkingElapsedSecs,
              });
            }

            if (supabase) {
              // Wait for initial chat handling to complete before final handling
              await initialChatPromise;

              await handleFinalChatAndAssistantMessage({
                supabase,
                modelParams,
                chatMetadata,
                profile,
                model,
                messages: originalMessages,
                finishReason: 'stop',
                title: generatedTitle,
                assistantMessage: text,
                citations,
                thinkingText: reasoning || undefined,
                thinkingElapsedSecs,
                assistantMessageId,
              });
            }
          },
        });

        for await (const part of result.fullStream) {
          if (part.type === 'source' && part.source.sourceType === 'url') {
            citations.push(part.source.url);
            dataStream.writeData({ citations });
          }
        }

        result.mergeIntoDataStream(dataStream, { sendReasoning: true });
      })(),
      (async () => {
        if (chatMetadata.id && chatMetadata.newChat) {
          generatedTitle = await generateTitleFromUserMessage({
            messages: originalMessages,
            abortSignal,
          });
          dataStream.writeData({ chatTitle: generatedTitle });
        }
      })(),
    ]);

    return 'Deep research completed';
  } catch (error) {
    if (!(error instanceof Error && error.message === 'terminated')) {
      console.error('[DeepResearch] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    throw error;
  } finally {
    // Clear keepalive interval
    clearInterval(keepaliveInterval);
  }
}
