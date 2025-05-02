import { supabase } from '@/lib/supabase/browser-client';
import type { TablesInsert } from '@/supabase/types';
import { localDB } from './local/db';

export const getMessageFileItemsByMessageId = async (
  messageId: string,
  useStored: boolean = true,
) => {
  if (useStored) {
    const fileItems = await localDB.fileItems.getByMessageId(messageId);
    if (fileItems) {
      return {
        id: messageId,
        file_items: fileItems,
      };
    }
  }

  const { data: messageFileItems, error } = await supabase
    .from('messages')
    .select(
      `
      id,
      file_items (*)
    `,
    )
    .eq('id', messageId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No file items found, return empty result
      return { id: messageId, file_items: [] };
    }
    // For other errors, throw
    throw new Error(error.message);
  }

  await localDB.fileItems.updateMany(messageFileItems.file_items);

  return messageFileItems;
};

export const createMessageFileItems = async (
  messageFileItems: TablesInsert<'message_file_items'>[],
) => {
  const { data: createdMessageFileItems, error } = await supabase
    .from('message_file_items')
    .insert(messageFileItems)
    .select('*');

  if (!createdMessageFileItems) {
    throw new Error(error.message);
  }

  await localDB.messageFileItems.updateMany(createdMessageFileItems);

  return createdMessageFileItems;
};

export const getFileItemsByMultipleChatIds = async (chatIds: string[]) => {
  if (chatIds.length === 0) {
    return [];
  }

  const { data: fileItems, error } = await supabase
    .from('files')
    .select('id, file_items(*)')
    .in('chat_id', chatIds);

  if (error) {
    throw new Error(error.message);
  }

  await localDB.fileItems.updateMany(
    fileItems.flatMap((file) => file.file_items),
  );

  return fileItems;
};

export const getMessageFileItemsByMultipleChatIds = async (
  chatIds: string[],
) => {
  if (chatIds.length === 0) {
    return [];
  }

  const { data: messageFileItems, error } = await supabase
    .from('messages')
    .select('id, message_file_items(*)')
    .in('chat_id', chatIds);

  if (error) {
    throw new Error(error.message);
  }

  await localDB.messageFileItems.updateMany(
    messageFileItems.flatMap((message) => message.message_file_items),
  );

  return messageFileItems;
};
