import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { createStreamResponse } from '@/lib/ai-helper';
import type {
  ChatMetadata,
  BuiltChatMessage,
  LLMID,
  RateLimitInfo,
} from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ToolHandlerConfig {
  messages: BuiltChatMessage[];
  profile: any;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
  isReasoningModel: boolean;
  rateLimitInfo: RateLimitInfo;
}

export async function handleToolExecution(config: ToolHandlerConfig) {
  const {
    messages,
    profile,
    isLargeModel,
    abortSignal,
    chatMetadata,
    model,
    supabase,
    isReasoningModel,
    rateLimitInfo,
  } = config;

  if (isReasoningModel) {
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
          rateLimitInfo,
        },
      });
    });
  }

  return null;
}
