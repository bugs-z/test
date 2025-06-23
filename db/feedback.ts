import { makeAuthenticatedRequest } from '@/lib/api/convex';
import type { Doc } from '@/convex/_generated/dataModel';

export type Feedback = Doc<'feedback'>;

export const saveFeedback = async (feedbackData: {
  message_id: string;
  user_id: string;
  chat_id: string;
  feedback: 'good' | 'bad';
  reason?: string;
  detailed_feedback?: string;
  model: string;
  sequence_number: number;
  allow_email?: boolean;
  allow_sharing?: boolean;
  has_files: boolean;
  plugin: string;
  updated_at: number;
}): Promise<void> => {
  try {
    const data = await makeAuthenticatedRequest('/api/feedback', 'POST', {
      type: 'save',
      ...feedbackData,
    });

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to save feedback');
    }
  } catch (error) {
    console.error('Error saving feedback:', error);
    throw error;
  }
};
