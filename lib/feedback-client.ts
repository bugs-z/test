import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Feedback } from '@/types/feedback';

// Create a single instance of the Convex client
const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const getFeedbackByChatId = async (
  messageIds: string[],
  chat_id: string,
  limit?: number,
  lastSequenceNumber?: number,
): Promise<(Feedback | null)[]> => {
  try {
    const feedbackResults = await convex.query(
      api.feedback.getFeedbackByChatId,
      {
        chat_id,
        limit,
        last_sequence_number: lastSequenceNumber,
      },
    );

    // Create a map of message ID to feedback
    const feedbackMap = new Map(
      feedbackResults.map((feedback) => [feedback.message_id, feedback]),
    );

    // Return array matching input message_ids order, with null for missing feedback
    return messageIds.map((messageId) => feedbackMap.get(messageId) ?? null);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return [];
  }
};
