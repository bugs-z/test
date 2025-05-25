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
  let assistantMessage = '';
  let reasoning = '';
  const citations: string[] = [];
  let isThinking = false;
  let thinkingStartTime: number | null = null;
  let finalThinkingTime: number | null = null;

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
        const { fullStream } = streamText({
          model: myProvider.languageModel('deep-research-model'),
          system: systemPrompt,
          messages: toVercelChatMessages(validatedMessages),
          maxTokens: 8192,
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
          onError: async (error) => {
            console.error('[DeepResearch] Stream Error:', error);
          },
          onFinish: async () => {
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
                assistantMessage,
                citations,
                thinkingText: reasoning || undefined,
                thinkingElapsedSecs: finalThinkingTime,
              });
            }
          },
        });

        let hasFirstTextDelta = false;

        for await (const delta of fullStream) {
          if (delta.type === 'source') {
            if (delta.source.sourceType === 'url') {
              citations.push(delta.source.url);
            }
          }

          if (delta.type === 'text-delta') {
            const { textDelta } = delta;

            if (!hasFirstTextDelta && textDelta.trim() !== '') {
              dataStream.writeData({ citations });
              hasFirstTextDelta = true;
            }

            if (textDelta.includes('<think>')) {
              isThinking = true;
              thinkingStartTime = Date.now();

              const [beforeThink, thinkingContent] = textDelta.split('<think>');
              if (beforeThink) {
                dataStream.writeData({
                  type: 'text-delta',
                  content: beforeThink,
                });
                assistantMessage += beforeThink;
              }
              if (thinkingContent) {
                dataStream.writeData({
                  type: 'reasoning',
                  content: thinkingContent,
                });
                reasoning += thinkingContent;
              }
              continue;
            }

            if (isThinking) {
              if (textDelta.includes('</think>')) {
                isThinking = false;
                const thinkingElapsedSecs = thinkingStartTime
                  ? Math.round((Date.now() - thinkingStartTime) / 1000)
                  : null;
                finalThinkingTime = thinkingElapsedSecs;

                const [finalThinking, afterThink] = textDelta.split('</think>');
                if (finalThinking) {
                  dataStream.writeData({
                    type: 'reasoning',
                    content: finalThinking,
                  });
                  reasoning += finalThinking;
                }

                dataStream.writeData({
                  type: 'thinking-time',
                  elapsed_secs: thinkingElapsedSecs,
                });

                if (afterThink) {
                  dataStream.writeData({
                    type: 'text-delta',
                    content: afterThink,
                  });
                  assistantMessage += afterThink;
                }
              } else {
                dataStream.writeData({
                  type: 'reasoning',
                  content: textDelta,
                });
                reasoning += textDelta;
              }
            } else {
              dataStream.writeData({
                type: 'text-delta',
                content: textDelta,
              });
              assistantMessage += textDelta;
            }
          }
        }
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
