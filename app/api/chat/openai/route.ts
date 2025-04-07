import { buildSystemPrompt } from '@/lib/ai/prompts';
import {
  filterEmptyAssistantMessages,
  addAuthMessage,
  toVercelChatMessages,
} from '@/lib/ai/message-utils';
import llmConfig from '@/lib/models/llm-config';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { createDataStreamResponse, smoothStream, streamText } from 'ai';
import { createToolSchemas } from '@/lib/ai/tools/toolSchemas';
import { PluginID } from '@/types/plugins';
import { executeWebSearchTool } from '@/lib/ai/tools/web-search';
import { createStreamResponse } from '@/lib/ai-helper';
import { executeTerminalAgent } from '@/lib/ai/tools/terminal-agent';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { executeReasoningWebSearchTool } from '@/lib/ai/tools/reasoning-web-search';
import { executeDeepResearchTool } from '@/lib/ai/tools/deep-research';
import { myProvider } from '@/lib/ai/providers';
import { terminalPlugins } from '@/lib/ai/terminal-utils';
import { getModerationResult } from '@/lib/server/moderation';
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
  try {
    const {
      messages,
      chatSettings,
      isContinuation,
      selectedPlugin,
      isTerminalContinuation,
    } = await request.json();

    const profile = await getAIProfile();
    const rateLimitModel =
      selectedPlugin &&
      selectedPlugin !== PluginID.NONE &&
      !terminalPlugins.includes(selectedPlugin as PluginID)
        ? selectedPlugin
        : 'gpt-4';

    const rateLimitCheckResult = await checkRatelimitOnApi(
      profile.user_id,
      rateLimitModel,
    );
    if (rateLimitCheckResult !== null) {
      return rateLimitCheckResult.response;
    }

    let systemPrompt = buildSystemPrompt(
      llmConfig.systemPrompts.agent,
      profile.profile_context,
    );

    let shouldUncensorResponse = false;

    if (
      llmConfig.openai.apiKey &&
      !isContinuation &&
      selectedPlugin !== PluginID.WEB_SEARCH &&
      selectedPlugin !== PluginID.REASONING &&
      selectedPlugin !== PluginID.REASONING_WEB_SEARCH &&
      selectedPlugin !== PluginID.DEEP_RESEARCH &&
      !terminalPlugins.includes(selectedPlugin as PluginID)
    ) {
      const { shouldUncensorResponse: moderationResult } =
        await getModerationResult(
          messages,
          llmConfig.openai.apiKey || '',
          10,
          true,
        );
      shouldUncensorResponse = moderationResult;
    }

    if (shouldUncensorResponse) {
      addAuthMessage(messages);
      filterEmptyAssistantMessages(messages);
    } else {
      filterEmptyAssistantMessages(messages);
    }

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

    // Handle special plugins
    switch (selectedPlugin) {
      case PluginID.WEB_SEARCH:
        return createStreamResponse(async (dataStream) => {
          await executeWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: true,
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
            config: { messages, profile, dataStream, isLargeModel: true },
          });
        });

      case PluginID.REASONING_WEB_SEARCH:
        return createStreamResponse(async (dataStream) => {
          await executeReasoningWebSearchTool({
            config: { messages, profile, dataStream, isLargeModel: true },
          });
        });

      case PluginID.DEEP_RESEARCH:
        return createStreamResponse(async (dataStream) => {
          await executeDeepResearchTool({
            config: { messages, profile, dataStream },
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

    const posthog = PostHogClient();
    if (posthog) {
      posthog.capture({
        distinctId: profile.user_id,
        event: 'chat-model-gpt-large',
      });
    }

    return createDataStreamResponse({
      execute: (dataStream) => {
        const { getSelectedSchemas } = createToolSchemas({
          chatSettings,
          messages,
          profile,
          dataStream,
          isTerminalContinuation,
          abortSignal: request.signal,
        });

        const result = streamText({
          model: myProvider.languageModel('chat-model-gpt-large'),
          messages: toVercelChatMessages(messages, true, systemPrompt),
          maxTokens: 2048,
          abortSignal: request.signal,
          tools: getSelectedSchemas(['browser', 'webSearch', 'terminal']),
          experimental_transform: smoothStream({ chunking: 'word' }),
        });

        result.mergeIntoDataStream(dataStream);
      },
    });
  } catch (error: any) {
    const errorMessage = error.message || 'An unexpected error occurred';
    const errorCode = error.status || 500;

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
