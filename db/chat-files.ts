import { supabase } from '@/lib/supabase/browser-client';

export const getChatFilesByChatId = async (chatId: string) => {
  const { data: chatFiles, error } = await supabase
    .from('files')
    .select('*')
    .eq('chat_id', chatId);

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned, chat not found
      return null;
    }
    // For other types of errors, we still throw
    throw new Error(`Error fetching chat files: ${error.message}`);
  }

  return chatFiles;
};

export const getChatFilesByMultipleChatIds = async (chatIds: string[]) => {
  if (chatIds.length === 0) {
    return [];
  }

  const { data: chatFiles, error } = await supabase
    .from('files')
    .select('*')
    .in('chat_id', chatIds);

  if (error) {
    throw new Error(`Error fetching chat files: ${error.message}`);
  }

  return chatFiles;
};
