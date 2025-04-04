import { buildSystemPrompt } from '@/lib/ai/prompts';
import { toVercelChatMessages } from '@/lib/ai/message-utils';
import llmConfig from '@/lib/models/llm-config';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import PostHogClient from '@/app/posthog';

interface DeepResearchConfig {
  messages: any[];
  profile: any;
  dataStream: any;
}

async function getProviderConfig(profile: any) {
  const systemPrompt = buildSystemPrompt(
    llmConfig.systemPrompts.reasoningWebSearch,
    profile.profile_context,
  );

  return {
    systemPrompt,
    model: myProvider.languageModel('deep-research'),
  };
}

export async function executeDeepResearchTool({
  config,
}: {
  config: DeepResearchConfig;
}) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('Perplexity API key is not set for deep research');
  }

  const { messages, profile, dataStream } = config;
  const { systemPrompt, model } = await getProviderConfig(profile);

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'deep_research_executed',
      properties: {
        model: model,
      },
    });
  }

  try {
    const { fullStream } = streamText({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...toVercelChatMessages(messages),
      ],
      maxTokens: 8192,
    });

    const citations: string[] = [];
    let hasFirstTextDelta = false;
    let thinkingStartTime: number | null = null;
    let isThinking = false;

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
          }
          if (thinkingContent) {
            dataStream.writeData({
              type: 'reasoning',
              content: thinkingContent,
            });
          }
          continue;
        }

        if (isThinking) {
          if (textDelta.includes('</think>')) {
            isThinking = false;
            const thinkingElapsedSecs = thinkingStartTime
              ? Math.round((Date.now() - thinkingStartTime) / 1000)
              : null;

            const [finalThinking, afterThink] = textDelta.split('</think>');
            if (finalThinking) {
              dataStream.writeData({
                type: 'reasoning',
                content: finalThinking,
              });
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
            }
          } else {
            dataStream.writeData({
              type: 'reasoning',
              content: textDelta,
            });
          }
        } else {
          dataStream.writeData({
            type: 'text-delta',
            content: textDelta,
          });
        }
      }
    }

    return 'Deep research completed';
  } catch (error) {
    console.error('[DeepResearch] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      model,
    });
    throw error;
  }
}
