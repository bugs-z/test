import { makeAuthenticatedRequest } from '@/lib/api/convex';
import type { Doc } from '@/convex/_generated/dataModel';

type MessageWithExtras = Doc<'messages'> & {
  image_paths?: string[];
  file_items?: Doc<'file_items'>[];
  feedback?: Doc<'feedback'>[];
};

type PaginatedMessagesResponse = {
  page: MessageWithExtras[];
  isDone: boolean;
  continueCursor: string | null;
};

export const getMessagesByChatId = async (
  chatId: string,
  numItems = 20,
  cursor?: string | null,
): Promise<PaginatedMessagesResponse> => {
  try {
    // Build URL with query parameters
    const url = new URL(
      '/messages',
      process.env.NEXT_PUBLIC_CONVEX_HTTP_ACTIONS_URL,
    );
    url.searchParams.append('chat_id', chatId);
    url.searchParams.append('numItems', numItems.toString());
    if (cursor) {
      url.searchParams.append('cursor', cursor);
    }

    const data = await makeAuthenticatedRequest(
      url.pathname + url.search,
      'GET',
    );
    if (!data) {
      return {
        page: [],
        isDone: true,
        continueCursor: null,
      };
    }

    return {
      page: (data.page || []) as MessageWithExtras[],
      isDone: data.isDone ?? true,
      continueCursor: data.continueCursor ?? null,
    };
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
};

export type SearchMessageResult = {
  id: string;
  chat_id: string;
  content: string;
  created_at: number;
  updated_at?: number;
  chat_name?: string;
};

type SearchMessagesResponse = {
  page: SearchMessageResult[];
  isDone: boolean;
  continueCursor: string | null;
};

export const searchMessages = async (
  searchQuery: string,
  cursor?: string | null,
): Promise<SearchMessagesResponse> => {
  try {
    // Build URL with query parameters
    const url = new URL(
      '/conversations/search',
      process.env.NEXT_PUBLIC_CONVEX_HTTP_ACTIONS_URL,
    );
    url.searchParams.append('query', searchQuery);
    if (cursor) {
      url.searchParams.append('cursor', cursor);
    }

    const data = await makeAuthenticatedRequest(
      url.pathname + url.search,
      'GET',
    );
    if (!data) {
      return {
        page: [],
        isDone: true,
        continueCursor: null,
      };
    }

    return {
      page: (data.page || []) as SearchMessageResult[],
      isDone: data.isDone ?? true,
      continueCursor: data.continueCursor ?? null,
    };
  } catch (error) {
    console.error('Error searching messages:', error);
    throw error;
  }
};
