import { supabase } from '@/lib/supabase/browser-client';

export const getMessageFileItemsByMessageId = async (messageId: string) => {
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

  return messageFileItems;
};

// export const createMessageFileItems = async (
//   messageFileItems: TablesInsert<'message_file_items'>[],
// ) => {
//   const { data: createdMessageFileItems, error } = await supabase
//     .from('message_file_items')
//     .insert(messageFileItems)
//     .select('*');

//   if (!createdMessageFileItems) {
//     throw new Error(error.message);
//   }

//   return createdMessageFileItems;
// };

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

  return messageFileItems;
};
