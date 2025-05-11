import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { handleErrorResponse } from '@/lib/models/api-error';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { createDataStreamResponse, smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import PostHogClient from '@/app/posthog';
import { handleToolExecution } from '@/lib/ai/tool-handler';
import { createToolSchemas } from '@/lib/ai/tools/toolSchemas';
import {
  processChatMessages,
  toVercelChatMessages,
} from '@/lib/ai/message-utils';
import { type LLMID, PluginID } from '@/types';
import {
  generateTitleFromUserMessage,
  handleChatWithMetadata,
} from '@/lib/ai/actions';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

// Increased max duration to allow for long reasoning tool responses
export const maxDuration = 180;

export const preferredRegion = [
  'iad1',
  'arn1',
  'bom1',
  'cdg1',
  'cle1',
  'cpt1',
  'dub1',
  'fra1',
  'gru1',
  'hnd1',
  'icn1',
  'kix1',
  'lhr1',
  'pdx1',
  'sfo1',
  'sin1',
  'syd1',
];

export async function POST(request: Request) {
  try {
    const userCountryCode = request.headers.get('x-vercel-ip-country');
    const { messages, model, modelParams, chatMetadata } = await request.json();

    const profile = await getAIProfile();
    const config = await getProviderConfig(
      model,
      profile,
      modelParams.selectedPlugin,
    );

    if (!config.isRateLimitAllowed) {
      return new Response(
        JSON.stringify({
          error: {
            type: 'ratelimit_hit',
            message: config.rateLimitInfo.message,
            isPremiumUser: config.isPremiumUser,
          },
        }),
        { status: 429 },
      );
    }

    const isReasoningModel =
      model === 'reasoning-model' || modelParams.selectedPlugin === 'reasoning';
    let supabase: SupabaseClient | null = null;
    let generatedTitle: string | undefined;
    let toolUsed = '';
    supabase = await createClient();

    const { processedMessages, systemPrompt } = await processChatMessages(
      messages,
      config.selectedModel,
      modelParams,
      config.isLargeModel,
      profile,
      isReasoningModel,
      supabase,
    );

    request.signal.addEventListener('abort', async () => {
      if (chatMetadata.id) {
        waitUntil(
          handleChatWithMetadata({
            supabase,
            chatMetadata,
            profile,
            model,
            title: generatedTitle,
            messages,
            finishReason: 'stop',
          }),
        );
      }
    });

    const toolResponse = await handleToolExecution({
      messages: processedMessages,
      profile,
      isLargeModel: config.isLargeModel,
      abortSignal: request.signal,
      chatMetadata,
      model,
      supabase,
      isReasoningModel,
      rateLimitInfo: config.rateLimitInfo,
    });
    if (toolResponse) {
      return toolResponse;
    }

    const posthog = PostHogClient();
    if (posthog) {
      posthog.capture({
        distinctId: profile.user_id,
        event: config.selectedModel,
      });
    }

    try {
      return createDataStreamResponse({
        execute: async (dataStream) => {
          dataStream.writeData({
            type: 'ratelimit',
            content: config.rateLimitInfo,
          });

          const result = streamText({
            model: myProvider.languageModel(config.selectedModel),
            system: systemPrompt,
            messages: toVercelChatMessages(processedMessages, true),
            maxTokens: 2048,
            abortSignal: request.signal,
            experimental_transform: smoothStream({ chunking: 'word' }),
            onChunk: async (chunk: any) => {
              if (chunk.chunk.type === 'tool-call') {
                toolUsed = chunk.chunk.toolName;
              }
            },
            onError: async (error) => {
              if (
                !(
                  error instanceof Error &&
                  error.name === 'AI_ToolExecutionError' &&
                  error.message.includes('terminated')
                )
              ) {
                console.error('[Chat] Stream Error:', error);
              }
            },
            tools: createToolSchemas({
              messages: processedMessages,
              profile,
              dataStream,
              abortSignal: request.signal,
              chatMetadata,
              model,
              supabase,
              userCountryCode,
            }).getSelectedSchemas(
              config.isLargeModel && !modelParams.isTemporaryChat
                ? ['browser', 'webSearch', 'terminal']
                : ['browser', 'webSearch'],
            ),
            onFinish: async ({ finishReason }: { finishReason: string }) => {
              if (chatMetadata.id && !toolUsed) {
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

          await Promise.all([
            result.mergeIntoDataStream(dataStream),
            (async () => {
              if (chatMetadata.id && chatMetadata.newChat) {
                generatedTitle = await generateTitleFromUserMessage({
                  messages,
                  abortSignal: request.signal,
                });
                dataStream.writeData({ chatTitle: generatedTitle });
              }
            })(),
          ]);
        },
      });
    } catch (error) {
      return handleErrorResponse(error);
    }
  } catch (error: any) {
    const errorMessage = error.message || 'An unexpected error occurred';
    const errorCode = error.status || 500;

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}

async function getProviderConfig(
  model: LLMID,
  profile: any,
  selectedPlugin: PluginID,
) {
  // Moving away from gpt-4-turbo-preview to chat-model-large
  const modelMap: Record<string, string> = {
    'mistral-medium': 'chat-model-small-with-tools',
    'mistral-large': 'chat-model-large-with-tools',
    'gpt-4-turbo-preview': 'chat-model-large-with-tools',
    'reasoning-model': 'reasoning-model',
  };
  // Moving away from gpt-4-turbo-preview to pentestgpt-pro
  const rateLimitModelMap: Record<string, string> = {
    'mistral-medium': 'pentestgpt',
    'mistral-large': 'pentestgpt-pro',
    'gpt-4-turbo-preview': 'pentestgpt-pro',
  };

  const selectedModel = modelMap[model];
  if (!selectedModel) {
    throw new Error('Selected model is undefined');
  }
  const isLargeModel = selectedModel.includes('large');

  const rateLimitModel =
    selectedPlugin !== PluginID.NONE
      ? selectedPlugin
      : rateLimitModelMap[model] || model;

  const rateLimitStatus = await checkRatelimitOnApi(
    profile.user_id,
    rateLimitModel,
  );

  return {
    selectedModel,
    isRateLimitAllowed: rateLimitStatus.allowed,
    isLargeModel,
    rateLimitInfo: rateLimitStatus.info,
    isPremiumUser: rateLimitStatus.info.isPremiumUser,
  };
}
