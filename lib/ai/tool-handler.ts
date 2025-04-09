import { PluginID } from '@/types/plugins';
import { executeWebSearchTool } from '@/lib/ai/tools/web-search';
import { executeTerminalAgent } from '@/lib/ai/tools/terminal-agent';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { executeReasoningWebSearchTool } from '@/lib/ai/tools/reasoning-web-search';
import { executeDeepResearchTool } from '@/lib/ai/tools/deep-research';
import { terminalPlugins } from '@/lib/ai/terminal-utils';
import { createStreamResponse } from '@/lib/ai-helper';

interface ToolHandlerConfig {
  messages: any[];
  profile: any;
  isTerminalContinuation: boolean;
  selectedPlugin: PluginID;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
}

export async function handleToolExecution(config: ToolHandlerConfig) {
  const {
    messages,
    profile,
    isTerminalContinuation,
    selectedPlugin,
    isLargeModel,
    abortSignal,
  } = config;

  if (isTerminalContinuation) {
    return createStreamResponse(async (dataStream) => {
      await executeTerminalAgent({
        config: {
          messages,
          profile,
          dataStream,
          isTerminalContinuation,
          abortSignal,
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
            isLargeModel,
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
            abortSignal,
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
            isLargeModel,
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
            isLargeModel,
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
              abortSignal,
            },
          });
        });
      }
  }

  return null;
}
