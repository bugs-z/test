import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import {
  filterEmptyAssistantMessages,
  handleAssistantMessages,
  messagesIncludeImages,
  toVercelChatMessages,
  validateMessages,
  addAuthMessage,
} from '@/lib/ai/message-utils';
import { handleErrorResponse } from '@/lib/models/api-error';
import llmConfig from '@/lib/models/llm-config';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { createDataStreamResponse, smoothStream, streamText } from 'ai';
import { getModerationResult } from '@/lib/server/moderation';
import { PluginID } from '@/types/plugins';
import { executeWebSearchTool } from '@/lib/ai/tools/web-search';
import { createStreamResponse } from '@/lib/ai-helper';
import { LargeModel } from '@/lib/models/hackerai-llm-list';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { executeReasoningWebSearchTool } from '@/lib/ai/tools/reasoning-web-search';
import { executeDeepResearchTool } from '@/lib/ai/tools/deep-research';
import { myProvider } from '@/lib/ai/providers';
import { executeTerminalAgent } from '@/lib/ai/tools/terminal-agent';
import { terminalPlugins } from '@/lib/ai/terminal-utils';
import { geolocation } from '@vercel/functions';
import PostHogClient from '@/app/posthog';

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
  const {
    messages,
    chatSettings,
    isContinuation,
    selectedPlugin,
    isTerminalContinuation,
  } = await request.json();

  try {
    const profile = await getAIProfile();
    const config = await getProviderConfig(
      chatSettings,
      profile,
      selectedPlugin,
    );

    if (!config.selectedModel) {
      throw new Error('Selected model is undefined');
    }
    if (config.rateLimitCheckResult !== null) {
      return config.rateLimitCheckResult.response;
    }

    // Build system prompt
    const baseSystemPrompt = config.isLargeModel
      ? llmConfig.systemPrompts.largeModel
      : llmConfig.systemPrompts.smallModel;
    const systemPrompt = buildSystemPrompt(
      baseSystemPrompt,
      profile.profile_context,
    );

    const includeImages = messagesIncludeImages(messages);
    let selectedChatModel = config.selectedModel;
    let shouldUncensorResponse = false;

    const handleMessages = (shouldUncensor: boolean) => {
      if (includeImages && config.isLargeModel) {
        selectedChatModel = 'vision-model';
      }

      if (shouldUncensor) {
        addAuthMessage(messages);
        if (
          !includeImages &&
          config.isLargeModel &&
          selectedPlugin !== PluginID.WEB_SEARCH &&
          selectedPlugin !== PluginID.REASONING &&
          selectedPlugin !== PluginID.REASONING_WEB_SEARCH &&
          selectedPlugin !== PluginID.DEEP_RESEARCH &&
          !terminalPlugins.includes(selectedPlugin as PluginID)
        ) {
          return handleAssistantMessages(messages);
        }
      }

      return filterEmptyAssistantMessages(messages);
    };

    const { region } = geolocation(request);
    if (
      llmConfig.openai.apiKey &&
      !isContinuation &&
      region !== 'bom1' &&
      region !== 'cpt1' &&
      !terminalPlugins.includes(selectedPlugin as PluginID) &&
      !isTerminalContinuation
    ) {
      const { shouldUncensorResponse: moderationResult } =
        await getModerationResult(
          messages,
          llmConfig.openai.apiKey || '',
          10,
          config.isLargeModel,
        );
      shouldUncensorResponse = moderationResult;
    }

    handleMessages(shouldUncensorResponse);

    if (isTerminalContinuation) {
      return createStreamResponse(async (dataStream) => {
        await executeTerminalAgent({
          config: {
            messages,
            profile,
            dataStream,
            isTerminalContinuation,
            abortSignal: request.signal,
          },
        });
      });
    }

    switch (selectedPlugin) {
      case PluginID.WEB_SEARCH:
        return createStreamResponse(async (dataStream) => {
          await executeWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: config.isLargeModel,
              directToolCall: true,
            },
          });
        });

      case PluginID.TERMINAL:
        return createStreamResponse(async (dataStream) => {
          await executeTerminalAgent({
            config: {
              messages,
              profile,
              dataStream,
              isTerminalContinuation,
              abortSignal: request.signal,
            },
          });
        });

      case PluginID.REASONING:
        return createStreamResponse(async (dataStream) => {
          await executeReasonLLMTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: config.isLargeModel,
            },
          });
        });

      case PluginID.REASONING_WEB_SEARCH:
        return createStreamResponse(async (dataStream) => {
          await executeReasoningWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: config.isLargeModel,
            },
          });
        });

      case PluginID.DEEP_RESEARCH:
        return createStreamResponse(async (dataStream) => {
          await executeDeepResearchTool({
            config: {
              messages,
              profile,
              dataStream,
            },
          });
        });

      default:
        if (terminalPlugins.includes(selectedPlugin as PluginID)) {
          return createStreamResponse(async (dataStream) => {
            await executeTerminalAgent({
              config: {
                messages,
                profile,
                dataStream,
                isTerminalContinuation,
                selectedPlugin: selectedPlugin as PluginID,
                abortSignal: request.signal,
              },
            });
          });
        }
    }

    // Remove last message if it's a continuation to remove the continue prompt
    const cleanedMessages = isContinuation ? messages.slice(0, -1) : messages;

    // Remove invalid message exchanges
    const validatedMessages = validateMessages(cleanedMessages);

    const posthog = PostHogClient();
    if (posthog) {
      posthog.capture({
        distinctId: profile.user_id,
        event: selectedChatModel,
      });
    }

    try {
      return createDataStreamResponse({
        execute: (dataStream) => {
          const result = streamText({
            model: myProvider.languageModel(selectedChatModel),
            system: systemPrompt,
            messages: toVercelChatMessages(validatedMessages, includeImages),
            maxTokens: 2048,
            abortSignal: request.signal,
            experimental_transform: smoothStream({ chunking: 'word' }),
          });

          result.mergeIntoDataStream(dataStream);
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
  chatSettings: any,
  profile: any,
  selectedPlugin: PluginID,
) {
  const isLargeModel = chatSettings.model === LargeModel.modelId;

  const defaultModel = 'chat-model-small';
  const proModel = 'chat-model-large';

  const selectedModel = isLargeModel ? proModel : defaultModel;

  const rateLimitModel =
    selectedPlugin &&
    selectedPlugin !== PluginID.NONE &&
    !terminalPlugins.includes(selectedPlugin as PluginID)
      ? selectedPlugin
      : isLargeModel
        ? 'pentestgpt-pro'
        : 'pentestgpt';

  const rateLimitCheckResult = await checkRatelimitOnApi(
    profile.user_id,
    rateLimitModel,
  );

  return {
    selectedModel,
    rateLimitCheckResult,
    isLargeModel,
  };
}
