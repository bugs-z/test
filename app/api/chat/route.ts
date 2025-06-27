import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { handleErrorResponse } from '@/lib/models/api-error';
import { createDataStreamResponse, smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import PostHogClient from '@/app/posthog';
import { handleToolExecution } from '@/lib/ai/tool-handler';
import { createToolSchemas } from '@/lib/ai/tools/toolSchemas';
import {
  processChatMessages,
  toVercelChatMessages,
} from '@/lib/ai/message-utils';
import {
  generateTitleFromUserMessage,
  handleInitialChatAndUserMessage,
  handleFinalChatAndAssistantMessage,
} from '@/lib/ai/actions';
import { validateChatAccessWithLimits } from '@/lib/ai/actions/chat-validation';
import { createClient } from '@/lib/supabase/server';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { ChatSDKError } from '@/lib/errors';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 180;

export async function POST(request: Request) {
  const abortController = new AbortController();
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { messages, model, modelParams, chatMetadata } = requestBody;
    const userCountryCode = request.headers.get('x-vercel-ip-country');

    const { profile } = await getAIProfile();

    const { chat, config } = await validateChatAccessWithLimits({
      chatMetadata,
      userId: profile.user_id,
      messages,
      model,
      selectedPlugin: modelParams.selectedPlugin,
    });

    const isReasoningModel = model === 'reasoning-model';
    let generatedTitle: string | undefined;
    let toolUsed = '';
    let hasGeneratedTitle = false;
    let titleGenerationPromise: Promise<void> | null = null;

    const {
      processedMessages,
      systemPrompt,
      // hasPdfAttachments,
      // hasImageAttachments,
    } = await processChatMessages(
      messages,
      config.selectedModel,
      modelParams,
      profile,
      isReasoningModel,
      config.isPremiumUser,
    );

    // Check for PDF or image attachments after processing and switch model if needed
    // let finalSelectedModel = config.selectedModel;
    // if (hasPdfAttachments) {
    //   if (config.selectedModel === 'chat-model-small-with-tools') {
    //     finalSelectedModel = 'chat-model-small';
    //   } else if (config.selectedModel === 'chat-model-large-with-tools') {
    //     finalSelectedModel = 'chat-model-large';
    //   }
    // } else if (hasImageAttachments) {
    //   finalSelectedModel = 'chat-model-vision';
    // }

    // Handle initial chat creation and user message in parallel with other operations
    const initialChatPromise = handleInitialChatAndUserMessage({
      modelParams,
      chatMetadata,
      profile,
      model,
      chat,
      messages,
    });

    const toolResponse = await handleToolExecution({
      chat,
      messages: processedMessages,
      modelParams,
      profile,
      isLargeModel: config.isLargeModel,
      abortSignal: abortController.signal,
      chatMetadata,
      model,
      isReasoningModel,
      rateLimitInfo: config.rateLimitInfo,
      initialChatPromise,
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

    const assistantMessageId = uuidv4();

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
            maxTokens: 4096,
            abortSignal: abortController.signal,
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: () => assistantMessageId,
            onChunk: async (chunk: any) => {
              if (chunk.chunk.type === 'tool-call') {
                toolUsed = chunk.chunk.toolName;
              } else if (
                !hasGeneratedTitle &&
                chatMetadata.id &&
                !chat &&
                !toolUsed &&
                chunk.chunk.type === 'text-delta'
              ) {
                hasGeneratedTitle = true;
                titleGenerationPromise = (async () => {
                  generatedTitle = await generateTitleFromUserMessage({
                    messages,
                    abortSignal: abortController.signal,
                  });
                  dataStream.writeData({ chatTitle: generatedTitle });
                })();
              }
            },
            onError: async (error) => {
              if (
                !(
                  error instanceof Error &&
                  error.name === 'AI_ToolExecutionError' &&
                  error.message.includes('terminated')
                ) &&
                !(
                  error instanceof Error &&
                  error.name === 'AI_InvalidToolArgumentsError'
                )
              ) {
                console.error('[Chat] Stream Error:', error);
              }
            },
            tools: createToolSchemas({
              chat,
              messages: processedMessages,
              modelParams,
              profile,
              dataStream,
              abortSignal: abortController.signal,
              chatMetadata,
              model,
              userCountryCode,
              initialChatPromise,
              assistantMessageId,
            }).getSelectedSchemas(
              config.isPremiumUser && !modelParams.isTemporaryChat
                ? ['browser', 'webSearch', 'hackerAIMCP']
                : ['browser', 'webSearch'],
            ),
            onFinish: async ({ finishReason, text }) => {
              if (!toolUsed) {
                // Wait for title generation if it's in progress
                if (titleGenerationPromise) {
                  await titleGenerationPromise;
                }
                // Wait for initial chat handling to complete before final handling
                await initialChatPromise;
                await handleFinalChatAndAssistantMessage({
                  modelParams,
                  chatMetadata,
                  profile,
                  model,
                  chat,
                  finishReason,
                  title: generatedTitle,
                  assistantMessage: text,
                  assistantMessageId,
                });
              }
            },
          });

          result.mergeIntoDataStream(dataStream);

          // Then ensure title generation completes if it was started
          if (titleGenerationPromise) {
            await titleGenerationPromise;
          }
        },
      });
    } catch (error) {
      return handleErrorResponse(error);
    }
  } catch (error: any) {
    // Handle ChatSDKError specifically
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    const errorMessage = error.message || 'An unexpected error occurred';
    const errorCode = error.status || 500;

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
