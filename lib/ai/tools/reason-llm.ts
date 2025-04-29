import { getSystemPrompt } from '@/lib/ai/prompts';
import { toVercelChatMessages } from '@/lib/ai/message-utils';
import { streamText } from 'ai';
import PostHogClient from '@/app/posthog';
import { handleChatWithMetadata } from '../actions';
import type { ChatMetadata, LLMID } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateTitleFromUserMessage } from '@/lib/ai/actions';
import { myProvider } from '../providers';

interface ReasonLLMConfig {
  messages: any[];
  profile: any;
  dataStream: any;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
}

async function getProviderConfig(profile: any) {
  const selectedModel = 'chat-model-reasoning';
  const systemPrompt = getSystemPrompt({
    selectedChatModel: selectedModel,
    profileContext: profile.profile_context,
  });

  return {
    systemPrompt,
    model: myProvider.languageModel(selectedModel),
  };
}

export async function executeReasonLLMTool({
  config,
}: {
  config: ReasonLLMConfig;
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key is not set for reason LLM');
  }

  const {
    messages,
    profile,
    dataStream,
    abortSignal,
    chatMetadata,
    model,
    supabase,
  } = config;
  const { systemPrompt, model: selectedModel } =
    await getProviderConfig(profile);

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'reason_llm_executed',
      properties: {
        model: selectedModel,
      },
    });
  }

  let generatedTitle: string | undefined;

  try {
    await Promise.all([
      (async () => {
        const { fullStream } = streamText({
          model: selectedModel,
          system: systemPrompt,
          messages: toVercelChatMessages(messages),
          maxTokens: 8192,
          abortSignal: abortSignal,
          providerOptions: {
            openai: {
              reasoningSummary: 'auto',
              reasoningEffort: 'high',
            },
          },
          onError: async (error) => {
            console.error('[ReasonLLM] Stream Error:', error);
          },
          onFinish: async ({ finishReason }: { finishReason: string }) => {
            if (supabase) {
              await handleChatWithMetadata({
                supabase,
                chatMetadata,
                profile,
                model,
                title: generatedTitle,
                messages,
                finishReason,
              });
            }
          },
        });

        let thinkingStartTime: number | null = null;
        let isThinking = false;

        for await (const delta of fullStream) {
          if (delta.type === 'text-delta') {
            dataStream.writeData({
              type: 'text-delta',
              content: delta.textDelta,
            });
          }

          if (delta.type === 'reasoning') {
            if (!isThinking) {
              isThinking = true;
              thinkingStartTime = Date.now();
            }

            dataStream.writeData({
              type: 'reasoning',
              content: delta.textDelta,
            });
          }
        }

        if (isThinking && thinkingStartTime) {
          isThinking = false;
          const thinkingElapsedSecs = Math.round(
            (Date.now() - thinkingStartTime) / 1000,
          );
          dataStream.writeData({
            type: 'thinking-time',
            elapsed_secs: thinkingElapsedSecs,
          });
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

    return 'Reason LLM execution completed';
  } catch (error) {
    console.error('[ReasonLLM] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      model,
    });
    throw error;
  }
}
