import type { LLMID, BuiltChatMessage, ModelParams } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractTextContent } from '../message-utils';
import type { TablesInsert, Tables } from '@/supabase/types';
import {
  deleteMessagesIncludingAndAfter,
  getNextMessageSequence,
  deleteLastMessage,
  insertMessages,
  insertFileItemRelationships,
  updateLastAssistantMessage,
} from './message-db-actions';

// Find the last message with role 'user'
export function getLastUserMessage(
  messages: BuiltChatMessage[],
): BuiltChatMessage | null {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');
  return lastUserMessage || null;
}

export async function saveUserMessage({
  supabase,
  chatId,
  userId,
  messages,
  modelParams,
  model,
  editSequenceNumber,
  retrievedFileItems,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  messages: BuiltChatMessage[];
  modelParams: ModelParams;
  model: LLMID;
  editSequenceNumber?: number;
  retrievedFileItems?: Tables<'file_items'>[];
}): Promise<void> {
  // If regeneration, delete the last message
  if (modelParams.isRegeneration) {
    await deleteLastMessage(supabase, chatId);
  }

  // Check if we should save the user message
  const shouldSaveUserMessage =
    !modelParams.isContinuation &&
    !modelParams.isTerminalContinuation &&
    !modelParams.isRegeneration;

  if (!shouldSaveUserMessage) {
    return;
  }

  // If editing, delete messages after the edited sequence
  if (editSequenceNumber !== undefined) {
    const { error } = await deleteMessagesIncludingAndAfter({
      supabase,
      userId,
      chatId,
      sequenceNumber: editSequenceNumber,
      retrieveFiles: true,
    });

    if (error) {
      throw new Error(`Failed to delete messages: ${error}`);
    }
  }

  const lastUserMessage = getLastUserMessage(messages);
  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  const content = extractTextContent(lastUserMessage.content);
  const sequence =
    editSequenceNumber ?? (await getNextMessageSequence(supabase, chatId));
  const thinkingEnabled = model === 'reasoning-model';

  // Extract image paths before creating message
  const imageContents = Array.isArray(lastUserMessage.content)
    ? lastUserMessage.content.filter((item) => item.type === 'image_url')
    : [];

  const imagePaths = imageContents.map(
    (imageContent) => imageContent.image_url.url,
  );

  const userMessageData: TablesInsert<'messages'> = {
    chat_id: chatId,
    user_id: userId,
    content,
    thinking_content: null,
    thinking_enabled: thinkingEnabled,
    thinking_elapsed_secs: null,
    model,
    plugin: modelParams.selectedPlugin,
    role: 'user',
    sequence_number: sequence,
    image_paths: imagePaths,
    citations: [],
    attachments: [],
  };

  // Insert user message
  const createdMessages = await insertMessages(supabase, [userMessageData]);
  const savedUserMessage = createdMessages[0];

  // Handle image relationships
  if (savedUserMessage) {
    // Handle file updates if there are any
    const fileAttachments = lastUserMessage.attachments || [];
    if (fileAttachments.length > 0) {
      const fileIds = fileAttachments
        .map((attachment) => attachment.file_id)
        .filter((id) => id !== undefined);

      if (fileIds.length > 0) {
        const { error: filesError } = await supabase
          .from('files')
          .update({ message_id: savedUserMessage.id, chat_id: chatId })
          .in('id', fileIds)
          .is('message_id', null);

        if (filesError) {
          console.error('Error updating files:', filesError);
        }
      }
    }

    // Handle file items if there are any
    if (retrievedFileItems && retrievedFileItems.length > 0) {
      await insertFileItemRelationships(
        supabase,
        userId,
        savedUserMessage.id,
        retrievedFileItems,
      );
    }
  }
}

export async function saveAssistantMessage({
  supabase,
  chatId,
  userId,
  modelParams,
  model,
  editSequenceNumber,
  assistantMessage,
  citations,
  thinkingText,
  thinkingElapsedSecs,
  fileAttachments,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  modelParams: ModelParams;
  model: LLMID;
  editSequenceNumber?: number;
  assistantMessage?: string;
  citations?: string[];
  thinkingText?: string;
  thinkingElapsedSecs?: number | null;
  fileAttachments?: any[];
}): Promise<void> {
  if (modelParams.isContinuation || modelParams.isTerminalContinuation) {
    await updateLastAssistantMessage(supabase, chatId, {
      assistantMessage,
      thinkingText,
      thinkingElapsedSecs,
      citations,
      fileAttachments,
    });
    return;
  }

  const sequence =
    editSequenceNumber ?? (await getNextMessageSequence(supabase, chatId));
  const thinkingEnabled = model === 'reasoning-model';

  const assistantMessageData: TablesInsert<'messages'> = {
    chat_id: chatId,
    user_id: userId,
    content: assistantMessage || '',
    thinking_content: thinkingText || null,
    thinking_enabled: thinkingEnabled,
    thinking_elapsed_secs: thinkingElapsedSecs || null,
    model,
    plugin: modelParams.selectedPlugin,
    role: 'assistant',
    sequence_number: sequence,
    image_paths: [],
    citations: citations || [],
    attachments: fileAttachments || [],
  };

  await insertMessages(supabase, [assistantMessageData]);
}
