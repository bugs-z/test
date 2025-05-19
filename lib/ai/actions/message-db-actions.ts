import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tables, TablesInsert } from '@/supabase/types';

export const deleteMessagesIncludingAndAfter = async ({
  supabase,
  userId,
  chatId,
  sequenceNumber,
  retrieveFiles = false,
}: {
  supabase: SupabaseClient;
  userId: string;
  chatId: string;
  sequenceNumber: number;
  retrieveFiles?: boolean;
}) => {
  let files: Tables<'files'>[] = [];

  if (retrieveFiles) {
    try {
      // Get messages at the sequence number
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .eq('sequence_number', sequenceNumber);

      if (messagesError) {
        console.error(
          '[deleteMessagesIncludingAndAfter] Error fetching messages:',
          messagesError,
        );
        throw messagesError;
      }

      // Get files associated with these messages
      const { data: filesData, error: filesError } = await supabase
        .from('files')
        .select('*')
        .in(
          'message_id',
          messagesData.map((message: Tables<'messages'>) => message.id),
        );

      if (filesError) {
        console.error(
          '[deleteMessagesIncludingAndAfter] Error fetching files:',
          filesError,
        );
        throw filesError;
      }

      // Update files to remove message_id
      if (filesData.length > 0) {
        const { error: updateError } = await supabase
          .from('files')
          .update({ message_id: null })
          .in(
            'id',
            filesData.map((file: Tables<'files'>) => file.id),
          );

        if (updateError) {
          console.error(
            '[deleteMessagesIncludingAndAfter] Error updating files:',
            updateError,
          );
          throw updateError;
        }
      }

      files = filesData;
    } catch (error) {
      console.error(
        '[deleteMessagesIncludingAndAfter] Error handling files:',
        error,
      );
      throw error;
    }
  }

  try {
    const { error } = await supabase.rpc(
      'delete_messages_including_and_after',
      {
        p_user_id: userId,
        p_chat_id: chatId,
        p_sequence_number: sequenceNumber,
      },
    );

    if (error) {
      console.error(
        '[deleteMessagesIncludingAndAfter] Error deleting messages:',
        error,
      );
      return {
        files,
        success: false,
        error: 'Failed to delete messages.',
      };
    }

    return {
      files,
      success: true,
      error: null,
    };
  } catch (error) {
    console.error('[deleteMessagesIncludingAndAfter] Error:', error);
    throw error;
  }
};

export const getNextMessageSequence = async (
  supabase: SupabaseClient,
  chatId: string,
): Promise<number> => {
  const { data, error } = await supabase
    .from('messages')
    .select('sequence_number')
    .eq('chat_id', chatId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data ? data.sequence_number + 1 : 1;
};

export const deleteLastMessage = async (
  supabase: SupabaseClient,
  chatId: string,
): Promise<void> => {
  const { data: lastMessage, error: lastMessageError } = await supabase
    .from('messages')
    .select('id')
    .eq('chat_id', chatId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .single();

  if (lastMessageError) {
    throw new Error(`Failed to get last message: ${lastMessageError}`);
  }

  if (lastMessage) {
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('id', lastMessage.id);

    if (deleteError) {
      throw new Error(`Failed to delete last message: ${deleteError}`);
    }
  }
};

export const insertMessages = async (
  supabase: SupabaseClient,
  messages: TablesInsert<'messages'>[],
): Promise<Tables<'messages'>[]> => {
  const { data: createdMessages, error: insertError } = await supabase
    .from('messages')
    .insert(messages)
    .select();

  if (insertError) {
    throw insertError;
  }

  if (!createdMessages || createdMessages.length !== messages.length) {
    throw new Error('Failed to create messages');
  }

  return createdMessages;
};

export const insertFileItemRelationships = async (
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
  fileItems: Tables<'file_items'>[],
): Promise<void> => {
  if (!fileItems || fileItems.length === 0) return;

  try {
    const fileItemRelationships = fileItems.map((fileItem) => ({
      user_id: userId,
      message_id: messageId,
      file_item_id: fileItem.id,
    }));

    const { error: fileItemsError } = await supabase
      .from('message_file_items')
      .insert(fileItemRelationships)
      .select('*');

    if (fileItemsError) {
      console.error('Error inserting file item relationships:', fileItemsError);
    }
  } catch (error) {
    console.error('Error in insertFileItemRelationships:', error);
  }
};

export const updateLastAssistantMessage = async (
  supabase: SupabaseClient,
  chatId: string,
  {
    assistantMessage,
    thinkingText,
    thinkingElapsedSecs,
    citations,
    fileAttachments,
  }: {
    assistantMessage?: string;
    thinkingText?: string;
    thinkingElapsedSecs?: number | null;
    citations?: string[];
    fileAttachments?: any[];
  },
): Promise<Tables<'messages'>> => {
  // Get the last assistant message
  const { data: lastAssistantMessage, error: lastMessageError } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('role', 'assistant')
    .order('sequence_number', { ascending: false })
    .limit(1)
    .single();

  if (lastMessageError) {
    throw new Error(
      `Failed to get last assistant message: ${lastMessageError}`,
    );
  }

  if (!lastAssistantMessage) {
    throw new Error('No assistant message found to continue');
  }

  // Append the new content to the existing message
  const updatedContent =
    lastAssistantMessage.content + (assistantMessage || '');
  const updatedThinkingContent = lastAssistantMessage.thinking_content
    ? lastAssistantMessage.thinking_content + (thinkingText || '')
    : thinkingText || null;
  const updatedThinkingElapsedSecs = lastAssistantMessage.thinking_elapsed_secs
    ? lastAssistantMessage.thinking_elapsed_secs + (thinkingElapsedSecs || 0)
    : thinkingElapsedSecs || null;
  const updatedCitations = [
    ...(lastAssistantMessage.citations || []),
    ...(citations || []),
  ];
  const updatedAttachments = [
    ...(lastAssistantMessage.attachments || []),
    ...(fileAttachments || []),
  ];

  const { error: updateError } = await supabase
    .from('messages')
    .update({
      content: updatedContent,
      thinking_content: updatedThinkingContent,
      thinking_elapsed_secs: updatedThinkingElapsedSecs,
      citations: updatedCitations,
      attachments: updatedAttachments,
    })
    .eq('id', lastAssistantMessage.id);

  if (updateError) {
    throw new Error(`Failed to update assistant message: ${updateError}`);
  }

  return {
    ...lastAssistantMessage,
    content: updatedContent,
    thinking_content: updatedThinkingContent,
    thinking_elapsed_secs: updatedThinkingElapsedSecs,
    citations: updatedCitations,
    attachments: updatedAttachments,
  };
};
