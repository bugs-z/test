import { extractTextContent } from './message-utils';
import type {
  LLMID,
  ChatMetadata,
  ModelParams,
  BuiltChatMessage,
} from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  saveUserMessage,
  saveAssistantMessage,
} from './actions/message-actions';
import { createChat, updateChat } from './actions/chat-actions';
import { generateObject } from 'ai';
import { myProvider } from './providers';
import { DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE } from './prompts';
import { z } from 'zod';

export async function handleInitialChatAndUserMessage({
  supabase,
  modelParams,
  chatMetadata,
  profile,
  model,
  messages,
}: {
  supabase: SupabaseClient;
  modelParams: ModelParams;
  chatMetadata: ChatMetadata;
  profile: { user_id: string };
  model: LLMID;
  messages: any[];
}) {
  if (!chatMetadata.id) return;

  const content = extractTextContent(messages[messages.length - 1].content);

  if (chatMetadata.newChat) {
    await createChat({
      supabase,
      chatId: chatMetadata.id,
      userId: profile.user_id,
      model,
      content,
      finishReason: 'stop', // Initial finish reason
    });
  }

  await saveUserMessage({
    chatId: chatMetadata.id,
    userId: profile.user_id,
    messages,
    modelParams,
    model,
    editSequenceNumber: modelParams.editSequenceNumber,
    retrievedFileItems: chatMetadata.retrievedFileItems,
  });
}

export async function handleFinalChatAndAssistantMessage({
  supabase,
  modelParams,
  chatMetadata,
  profile,
  model,
  messages,
  finishReason,
  title,
  assistantMessage,
  citations,
  thinkingText,
  thinkingElapsedSecs,
  fileAttachments,
  assistantMessageId,
}: {
  supabase: SupabaseClient;
  modelParams: ModelParams;
  chatMetadata: ChatMetadata;
  profile: { user_id: string };
  model: LLMID;
  messages: any[];
  finishReason: string;
  title?: string;
  assistantMessage?: string;
  citations?: string[];
  thinkingText?: string;
  thinkingElapsedSecs?: number | null;
  fileAttachments?: any[];
  assistantMessageId?: string;
}) {
  if (!chatMetadata.id) return;

  const content = extractTextContent(messages[messages.length - 1].content);

  await updateChat({
    supabase,
    chatId: chatMetadata.id,
    userId: profile.user_id,
    model,
    title,
    content,
    finishReason,
    newChat: chatMetadata.newChat,
  });

  await saveAssistantMessage({
    chatId: chatMetadata.id,
    userId: profile.user_id,
    modelParams,
    model,
    editSequenceNumber: modelParams.editSequenceNumber,
    assistantMessage,
    citations,
    thinkingText,
    thinkingElapsedSecs,
    fileAttachments,
    assistantMessageId,
  });
}

export async function generateTitleFromUserMessage({
  messages,
  abortSignal,
}: {
  messages: BuiltChatMessage[];
  abortSignal: AbortSignal;
}) {
  try {
    const message =
      messages.find((m: { role: string }) => m.role === 'user') ||
      messages[messages.length - 1];
    const textContent = extractTextContent(message.content);

    const {
      object: { title },
    } = await generateObject({
      model: myProvider.languageModel('chat-model-small'),
      schema: z.object({
        title: z.string().describe('The generated title (3-5 words)'),
      }),
      messages: [
        {
          role: 'user',
          content: DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE(textContent),
        },
      ],
      abortSignal,
      maxTokens: 50,
    });

    return title;
  } catch (error) {
    console.error('[Title Generation] Error:', error);
    // Return a fallback title based on the first message content
    const message =
      messages.find((m: { role: string }) => m.role === 'user') ||
      messages[messages.length - 1];
    const textContent = extractTextContent(message.content);
    return textContent.substring(0, 100).trim();
  }
}
