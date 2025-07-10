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
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { ChatSDKError } from '@/lib/errors';
import { v4 as uuidv4 } from 'uuid';
import { PluginID, type FileAttachment } from '@/types';
import { geolocation } from '@vercel/functions';
import { pauseSandbox } from '@/lib/ai/tools/agent/utils/sandbox';
import { getToolsForPlugin } from '@/lib/ai/tool-selection';

export const maxDuration = 240;

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
    const { messages, model, modelParams, chatMetadata, userInfo } =
      requestBody;
    const userLocation = {
      ...geolocation(request),
      timezone: userInfo?.timezone,
    };

    const { profile } = await getAIProfile();

    const validationResult = await validateChatAccessWithLimits({
      chatMetadata,
      userId: profile.user_id,
      messages,
      model,
    });

    if (!validationResult.success) {
      return validationResult.response;
    }

    const { chat, config } = validationResult;

    const isReasoningModel = model === 'reasoning-model';
    let generatedTitle: string | undefined;
    let toolUsed = '';
    let hasGeneratedTitle = false;
    let titleGenerationPromise: Promise<void> | null = null;
    const citations: string[] = [];
    const imagePaths: string[] = [];

    const {
      processedMessages,
      systemPrompt,
      hasPdfAttachments,
      hasImageAttachments,
      pentestFiles,
    } = await processChatMessages(
      messages,
      config.selectedModel,
      modelParams,
      profile,
      isReasoningModel,
      config.isPremiumUser,
      modelParams.selectedPlugin === PluginID.TERMINAL, // Generate pentestFiles when terminal plugin is selected
      userLocation,
    );

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

    if (
      !hasImageAttachments &&
      !hasPdfAttachments &&
      config.selectedModel === 'chat-model-small'
    ) {
      config.selectedModel = 'chat-model-small-text';
    }

    let assistantMessage = '';
    let terminalUsed = false;
    const fileAttachments: FileAttachment[] = [];
    const assistantMessageId = uuidv4();

    try {
      return createDataStreamResponse({
        execute: async (dataStream) => {
          dataStream.writeData({
            type: 'ratelimit',
            content: config.rateLimitInfo,
          });

          const originalWriteData = dataStream.writeData;
          dataStream.writeData = (data: any) => {
            if (data.type === 'text-delta' && data.content) {
              assistantMessage += data.content;
            } else if (
              data.type === 'file-attachment' &&
              Array.isArray(data.content)
            ) {
              fileAttachments.push(...data.content);
            }
            originalWriteData(data);
          };

          const toolSchemas = createToolSchemas({
            profile,
            dataStream,
            abortSignal: abortController.signal,
            agentMode: modelParams.agentMode,
            pentestFiles,
            messages,
            isTerminalContinuation: modelParams.isTerminalContinuation,
          });

          const result = streamText({
            model: myProvider.languageModel(config.selectedModel),
            system: systemPrompt,
            providerOptions: {
              openai: {
                parallelToolCalls: false,
                store: false,
              },
            },
            messages: toVercelChatMessages(processedMessages, true),
            maxTokens: 4096,
            maxSteps: 3,
            tools: toolSchemas.getSelectedSchemas(
              getToolsForPlugin(
                modelParams.selectedPlugin,
                config,
                modelParams,
              ),
            ),
            abortSignal: abortController.signal,
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: () => assistantMessageId,
            onChunk: async (event: any) => {
              if (event.chunk.type === 'tool-call') {
                toolUsed = event.chunk.toolName;
                if (toolUsed === 'run_terminal_cmd') {
                  terminalUsed = true;
                }
              } else if (event.chunk.type === 'tool-result') {
                // Handle tool results and extract citations
                const { toolName, result } = event.chunk;

                if (toolName === 'image_gen') {
                  if (result?.success && result?.imagePaths) {
                    imagePaths.push(...result.imagePaths);
                  }
                } else if (toolName === 'browser' && result?.url) {
                  // For browser tool, add the URL as citation
                  citations.push(result.url);
                } else if (toolName === 'webSearch' && Array.isArray(result)) {
                  // For web search tool, extract URLs from results
                  const searchCitations = result
                    .map((item: any) => item.url)
                    .filter((url: string) => url);

                  citations.push(...searchCitations);
                }
              } else if (
                !hasGeneratedTitle &&
                chatMetadata.id &&
                !chat &&
                event.chunk.type === 'text-delta'
              ) {
                hasGeneratedTitle = true;
                titleGenerationPromise = (async () => {
                  generatedTitle = await generateTitleFromUserMessage({
                    messages,
                    abortSignal: abortController.signal,
                  });
                  dataStream.writeData({ chatTitle: generatedTitle });
                })();
              } else if (event.chunk.type === 'text-delta') {
                // Note: writeData wrapper only captures dataStream, not AI text chunks from onChunk
                assistantMessage += event.chunk.textDelta;
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
            onFinish: async ({ finishReason, text }) => {
              // Wait for title generation if it's in progress
              if (titleGenerationPromise) {
                await titleGenerationPromise;
              }
              // Wait for initial chat handling to complete before final handling
              await initialChatPromise;

              // Deduplicate citations
              const uniqueCitations =
                citations.length > 0 ? [...new Set(citations)] : undefined;

              await handleFinalChatAndAssistantMessage({
                modelParams: {
                  ...modelParams,
                  selectedPlugin: terminalUsed
                    ? PluginID.TERMINAL
                    : modelParams.selectedPlugin,
                },
                chatMetadata,
                profile,
                model,
                chat,
                finishReason:
                  finishReason === 'tool-calls' && terminalUsed
                    ? 'terminal-calls'
                    : finishReason,
                title: generatedTitle,
                assistantMessage: terminalUsed ? assistantMessage : text,
                citations: uniqueCitations,
                imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
                fileAttachments,
                assistantMessageId,
              });

              // Pause sandbox if it was used
              const sandbox = toolSchemas.getSandbox();
              if (sandbox) {
                await pauseSandbox(sandbox);
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
