import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { createStreamResponse } from '@/lib/ai-helper';
import type {
  ChatMetadata,
  BuiltChatMessage,
  LLMID,
  RateLimitInfo,
  ModelParams,
} from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ToolHandlerConfig {
  messages: BuiltChatMessage[];
  modelParams: ModelParams;
  profile: any;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
  isReasoningModel: boolean;
  rateLimitInfo: RateLimitInfo;
  initialChatPromise: Promise<void>;
}

export async function handleToolExecution(config: ToolHandlerConfig) {
  const {
    messages,
    modelParams,
    profile,
    isLargeModel,
    abortSignal,
    chatMetadata,
    model,
    supabase,
    isReasoningModel,
    rateLimitInfo,
    initialChatPromise,
  } = config;

  if (isReasoningModel) {
    return createStreamResponse(async (dataStream) => {
      await executeReasonLLMTool({
        config: {
          messages,
          modelParams,
          profile,
          dataStream,
          isLargeModel,
          abortSignal,
          chatMetadata,
          model,
          supabase,
          rateLimitInfo,
          initialChatPromise,
        },
      });
    });
  }

  return null;
}
