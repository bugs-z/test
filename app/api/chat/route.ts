import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { getSystemPrompt } from '@/lib/ai/prompts';
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
import { myProvider } from '@/lib/ai/providers';
import { terminalPlugins } from '@/lib/ai/terminal-utils';
import { geolocation } from '@vercel/functions';
import PostHogClient from '@/app/posthog';
import { handleToolExecution } from '@/lib/ai/tool-handler';
import { createToolSchemas } from '@/lib/ai/tools/toolSchemas';
import { processRag } from '@/lib/ai/rag-processor';

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
    const {
      messages,
      chatSettings,
      isContinuation,
      selectedPlugin,
      isTerminalContinuation,
      isRagEnabled,
    } = await request.json();

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

    let shouldUncensorResponse = false;
    const { region } = geolocation(request);
    if (
      llmConfig.openai.apiKey &&
      !isContinuation &&
      !isTerminalContinuation &&
      !terminalPlugins.includes(selectedPlugin as PluginID) &&
      selectedPlugin !== PluginID.TERMINAL &&
      region !== 'bom1' &&
      region !== 'cpt1'
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

    let selectedChatModel = config.selectedModel;
    let supportsImages = true;
    const handleMessages = (shouldUncensor: boolean) => {
      // Handle vision support for large model
      if (selectedChatModel === 'chat-model-large') {
        supportsImages = messagesIncludeImages(messages);
        if (supportsImages) {
          selectedChatModel = 'vision-model';
        }
      }

      if (shouldUncensor) {
        addAuthMessage(messages);
        if (
          selectedChatModel === 'chat-model-large' &&
          selectedPlugin !== PluginID.WEB_SEARCH &&
          selectedPlugin !== PluginID.REASONING &&
          selectedPlugin !== PluginID.REASONING_WEB_SEARCH &&
          selectedPlugin !== PluginID.DEEP_RESEARCH &&
          !terminalPlugins.includes(selectedPlugin as PluginID) &&
          !isRagEnabled
        ) {
          return handleAssistantMessages(messages);
        }
      }

      return filterEmptyAssistantMessages(messages);
    };

    handleMessages(shouldUncensorResponse);

    // Remove invalid message exchanges
    const validatedMessages = validateMessages(messages);

    const toolResponse = await handleToolExecution({
      messages,
      profile,
      isTerminalContinuation,
      selectedPlugin,
      isLargeModel: config.isLargeModel,
      abortSignal: request.signal,
    });
    if (toolResponse) {
      return toolResponse;
    }

    let systemPrompt = getSystemPrompt({
      selectedChatModel,
      profileContext: profile.profile_context,
    });

    // Process RAG
    let ragUsed = false;
    let ragId: string | null = null;
    if (isRagEnabled) {
      const ragResult = await processRag({
        messages,
        isContinuation,
        profile,
        selectedChatModel,
      });

      ragUsed = ragResult.ragUsed;
      ragId = ragResult.ragId;
      if (ragResult.systemPrompt) {
        systemPrompt = ragResult.systemPrompt;
      }
    }

    const posthog = PostHogClient();
    if (posthog) {
      posthog.capture({
        distinctId: profile.user_id,
        event: selectedChatModel,
      });
    }

    const addActiveTools =
      selectedChatModel === 'chat-model-gpt-large' && !ragUsed;
    if (addActiveTools) {
      selectedChatModel = 'chat-model-gpt-large-with-tools';
    }

    try {
      return createDataStreamResponse({
        execute: (dataStream) => {
          dataStream.writeData({ ragUsed, ragId });

          const baseConfig = {
            model: myProvider.languageModel(selectedChatModel),
            system: systemPrompt,
            messages: toVercelChatMessages(validatedMessages, supportsImages),
            maxTokens: 2048,
            abortSignal: request.signal,
            experimental_transform: smoothStream({ chunking: 'word' }),
          };

          const result = addActiveTools
            ? streamText({
                ...baseConfig,
                tools: createToolSchemas({
                  chatSettings,
                  messages: validatedMessages,
                  profile,
                  dataStream,
                  isTerminalContinuation,
                  abortSignal: request.signal,
                }).getSelectedSchemas(['browser', 'webSearch', 'terminal']),
              })
            : streamText(baseConfig);

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
  const modelMap: Record<string, string> = {
    'mistral-medium': 'chat-model-small',
    'mistral-large': 'chat-model-large',
    'gpt-4-turbo-preview': 'chat-model-gpt-large',
  };

  const rateLimitModelMap: Record<string, string> = {
    'mistral-medium': 'pentestgpt',
    'mistral-large': 'pentestgpt-pro',
    'gpt-4-turbo-preview': 'gpt4o',
  };

  const selectedModel = modelMap[chatSettings.model];
  const isLargeModel = chatSettings.model.includes('large');

  const rateLimitModel =
    selectedPlugin !== PluginID.NONE &&
    !terminalPlugins.includes(selectedPlugin as PluginID)
      ? selectedPlugin
      : rateLimitModelMap[chatSettings.model] || chatSettings.model;

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
