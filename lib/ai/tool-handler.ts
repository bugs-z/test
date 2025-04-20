import { PluginID } from '@/types/plugins';
import { executeWebSearchTool } from '@/lib/ai/tools/web-search';
import { executeTerminalAgent } from '@/lib/ai/tools/terminal-agent';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { terminalPlugins } from '@/lib/ai/terminal-utils';
import { createStreamResponse } from '@/lib/ai-helper';
import { ChatMetadata, BuiltChatMessage, AgentMode, LLMID } from '@/types';
import { SupabaseClient } from '@supabase/supabase-js';
interface ToolHandlerConfig {
  messages: BuiltChatMessage[];
  profile: any;
  isTerminalContinuation: boolean;
  selectedPlugin: PluginID;
  isLargeModel: boolean;
  agentMode: AgentMode;
  confirmTerminalCommand: boolean;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
}

export async function handleToolExecution(config: ToolHandlerConfig) {
  const {
    messages,
    profile,
    isTerminalContinuation,
    selectedPlugin,
    isLargeModel,
    agentMode,
    confirmTerminalCommand,
    abortSignal,
    chatMetadata,
    model,
    supabase,
  } = config;

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
            abortSignal,
            chatMetadata,
            model,
            supabase,
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
            abortSignal,
            chatMetadata,
            model,
            supabase,
          },
        });
      });

    default:
      if (
        isTerminalContinuation ||
        confirmTerminalCommand ||
        terminalPlugins.includes(selectedPlugin as PluginID) ||
        selectedPlugin === PluginID.TERMINAL
      ) {
        return createStreamResponse(async (dataStream) => {
          await executeTerminalAgent({
            config: {
              messages,
              profile,
              dataStream,
              selectedPlugin: selectedPlugin as PluginID,
              agentMode,
              confirmTerminalCommand,
              abortSignal,
              chatMetadata,
              model,
              supabase,
            },
          });
        });
      }
  }

  return null;
}
