import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

// Create a single instance of the Convex client
const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const getMessageFileItemsByMessageId = async (messageId: string) => {
  try {
    const result = await convex.query(api.file_items.getFileItemsByMessageId, {
      messageId,
    });

    return result;
  } catch (error) {
    console.error('Error fetching message file items:', error);
    // Return empty result on error to maintain consistent behavior
    return { id: messageId, file_items: [] };
  }
};
