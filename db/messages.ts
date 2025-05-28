import { supabase } from '@/lib/supabase/browser-client';
import { getFeedbackByChatId } from '@/lib/feedback-client';

export const getMessagesByChatId = async (
  chatId: string,
  limit = 20,
  lastSequenceNumber?: number,
) => {
  let query = supabase
    .from('messages')
    .select('*, file_items (*)')
    .eq('chat_id', chatId)
    .order('sequence_number', { ascending: false })
    .limit(limit);

  if (lastSequenceNumber !== undefined) {
    query = query.lt('sequence_number', lastSequenceNumber);
  }

  const { data: messages } = await query;

  if (!messages) {
    throw new Error('Messages not found');
  }

  // Get feedback for all messages in one query
  const messageIds = messages.map((message) => message.id);
  const feedbackResults = await getFeedbackByChatId(
    messageIds,
    chatId,
    limit,
    lastSequenceNumber,
  );

  // Combine messages with their feedback
  const messagesWithFeedback = messages.map((message, index) => ({
    ...message,
    feedback: feedbackResults[index] ? [feedbackResults[index]] : [],
  }));

  return messagesWithFeedback.reverse();
};
