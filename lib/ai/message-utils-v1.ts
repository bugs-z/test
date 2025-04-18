import type { BuiltChatMessage } from '@/types/chat-message';
import { PluginID } from '@/types/plugins';
import { terminalPlugins } from '@/lib/ai/terminal-utils';
import { getModerationResult } from '@/lib/server/moderation';
import { getSystemPrompt } from './prompts';
import {
  validateMessages,
  addAuthMessage,
  filterEmptyAssistantMessages,
} from './message-utils';

/**
 * Processes chat messages and handles model selection, uncensoring, and validation
 * @param messages - Array of messages to process
 * @param selectedModel - The initially selected model
 * @param selectedPlugin - The selected plugin ID
 * @param isRagEnabled - Whether RAG is enabled
 * @param isContinuation - Whether this is a continuation request
 * @param isTerminalContinuation - Whether this is a terminal continuation request
 * @param region - The request region
 * @param apiKey - The OpenAI API key
 * @param isLargeModel - Whether the model is large
 * @returns Object containing the processed messages and model information
 */
export async function processChatMessages(
  messages: BuiltChatMessage[],
  selectedModel: string,
  selectedPlugin: PluginID,
  isContinuation: boolean,
  isTerminalContinuation: boolean,
  apiKey: string | undefined,
  isLargeModel: boolean,
  profileContext: string,
): Promise<{
  messages: BuiltChatMessage[];
  selectedModel: string;
  systemPrompt: string;
}> {
  const selectedChatModel = selectedModel;
  let shouldUncensor = false;

  // Check if we should uncensor the response
  if (
    apiKey &&
    !isContinuation &&
    !isTerminalContinuation &&
    !terminalPlugins.includes(selectedPlugin as PluginID) &&
    // Skip uncensoring for reasoning plugin as it uses xAI model
    selectedPlugin !== PluginID.REASONING
  ) {
    const { shouldUncensorResponse: moderationResult } =
      await getModerationResult(messages, apiKey, 10, isLargeModel);
    shouldUncensor = moderationResult;
  }

  if (shouldUncensor) {
    addAuthMessage(messages);
  }

  filterEmptyAssistantMessages(messages);

  // Remove invalid message exchanges
  const validatedMessages = validateMessages(messages);

  const systemPrompt = getSystemPrompt({
    selectedChatModel: selectedChatModel,
    profileContext: profileContext,
  });

  return {
    messages: validatedMessages,
    selectedModel: selectedChatModel,
    systemPrompt,
  };
}
