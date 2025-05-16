import { supabase } from '@/lib/supabase/browser-client';
import type { TablesInsert } from '@/supabase/types';

export const createMessageFeedback = async (
  feedback: TablesInsert<'feedback'>,
) => {
  const { data: createdFeedback, error } = await supabase
    .from('feedback')
    .upsert(feedback, { onConflict: 'user_id, chat_id, message_id' })
    .select('*');

  if (!createdFeedback) {
    throw new Error(error.message);
  }

  return createdFeedback;
};

export const getFeedbackByMultipleChatIds = async (chatIds: string[]) => {
  if (chatIds.length === 0) {
    return [];
  }

  const { data: feedback, error } = await supabase
    .from('feedback')
    .select('*')
    .in('chat_id', chatIds);

  if (error) {
    throw new Error(error.message);
  }

  if (!feedback) {
    return [];
  }

  return feedback;
};
