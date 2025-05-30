import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

// Create a single instance of the Convex client
const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const getChatFilesByChatId = async (chatId: string) => {
  try {
    const chatFiles = await convex.query(api.files.getFiles, {
      chatId: chatId,
    });

    return chatFiles || [];
  } catch (error) {
    console.error('[getChatFilesByChatId] Error fetching chat files:', error);
    throw error;
  }
};
