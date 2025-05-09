import { PluginID } from '@/types/plugins';
import { executeTerminalAgent } from '@/lib/ai/tools/pentest-agent';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { createStreamResponse } from '@/lib/ai-helper';
import type { ChatMetadata, BuiltChatMessage, AgentMode, LLMID } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  isPremiumUser: boolean;
  userCountryCode: string | null;
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
    isPremiumUser,
    userCountryCode,
  } = config;

  switch (selectedPlugin) {
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
        selectedPlugin === PluginID.TERMINAL
      ) {
        return createStreamResponse(async (dataStream) => {
          await executeTerminalAgent({
            config: {
              messages,
              profile,
              dataStream,
              agentMode,
              confirmTerminalCommand,
              abortSignal,
              chatMetadata,
              model,
              supabase,
              isPremiumUser,
              userCountryCode,
            },
          });
        });
      }
  }

  return null;
}
