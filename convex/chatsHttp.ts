import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Helper function to create response with consistent headers
const createResponse = (
  data: unknown,
  status: number,
  origin: string | null,
) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    },
  });
};

// Helper function to validate auth token and get user
const validateAuth = async (authHeader: string | null) => {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.split(' ')[1]);

  if (authError || !user) {
    throw new Error('Invalid token');
  }

  return user;
};

// Helper function to validate user ID
const validateUserId = (
  providedUserId: string,
  authenticatedUserId: string,
) => {
  if (providedUserId !== authenticatedUserId) {
    throw new Error('Unauthorized: User ID mismatch');
  }
};

// Main HTTP action handler for all chat operations
export const handleChatsHttp = httpAction(async (ctx, request) => {
  const origin = request.headers.get('Origin');

  // Only allow POST requests
  if (request.method !== 'POST') {
    return createResponse({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    // Validate authentication
    const user = await validateAuth(request.headers.get('Authorization'));

    // Parse request body
    const body = await request.json();
    const { type, chatId, userId, updates, paginationOpts } = body;

    // Route based on operation type
    switch (type) {
      case 'get': {
        if (chatId) {
          // Get single chat
          const chat = await ctx.runQuery(internal.chats.getChatById, {
            chatId,
          });
          // Validate user ID if chat exists
          if (chat && chat.user_id !== user.id) {
            return createResponse({ error: 'Unauthorized' }, 401, origin);
          }
          return createResponse({ chat }, 200, origin);
        } else if (userId) {
          // Validate user ID for get chats by user ID
          validateUserId(userId, user.id);
          // Get chats by user ID
          const result = await ctx.runQuery(internal.chats.getChatsByUserId, {
            userId,
            paginationOpts: {
              numItems: paginationOpts?.numItems ?? 25,
              cursor: paginationOpts?.cursor ?? null,
            },
          });
          return createResponse(result, 200, origin);
        }
        return createResponse(
          { error: 'Missing required parameters' },
          400,
          origin,
        );
      }

      case 'update': {
        if (!chatId) {
          return createResponse(
            { error: 'Missing chat_id parameter' },
            400,
            origin,
          );
        }
        if (!updates) {
          return createResponse({ error: 'Missing updates data' }, 400, origin);
        }
        // Get chat to validate ownership
        const existingChat = await ctx.runQuery(internal.chats.getChatById, {
          chatId,
        });
        if (!existingChat) {
          return createResponse({ error: 'Chat not found' }, 404, origin);
        }
        // Validate user ID for chat update
        validateUserId(existingChat.user_id, user.id);
        const result = await ctx.runMutation(
          internal.chats.InternalUpdateChat,
          {
            chatId,
            updates,
          },
        );
        return createResponse(result, result.success ? 200 : 400, origin);
      }

      case 'delete': {
        if (!chatId) {
          return createResponse(
            { error: 'Missing chat_id parameter' },
            400,
            origin,
          );
        }
        // Get chat to validate ownership
        const existingChat = await ctx.runQuery(internal.chats.getChatById, {
          chatId,
        });
        if (!existingChat) {
          return createResponse({ error: 'Chat not found' }, 404, origin);
        }
        // Validate user ID for chat deletion
        validateUserId(existingChat.user_id, user.id);
        const result = await ctx.runMutation(internal.chats.deleteChat, {
          chatId,
        });
        return createResponse(result, result.success ? 200 : 400, origin);
      }

      case 'deleteAll': {
        if (!userId) {
          return createResponse(
            { error: 'Missing user_id parameter' },
            400,
            origin,
          );
        }
        // Validate user ID for delete all chats
        validateUserId(userId, user.id);
        const result = await ctx.runMutation(internal.chats.deleteAllChats, {
          userId,
        });
        return createResponse(result, result.success ? 200 : 400, origin);
      }

      default:
        return createResponse({ error: 'Invalid operation type' }, 400, origin);
    }
  } catch (error) {
    console.error('Error handling chat request:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return createResponse({ error: 'Unauthorized' }, 401, origin);
      }
      if (error.message === 'Invalid token') {
        return createResponse({ error: 'Invalid token' }, 401, origin);
      }
      if (error.message === 'Unauthorized: User ID mismatch') {
        return createResponse(
          { error: 'Unauthorized: User ID mismatch' },
          403,
          origin,
        );
      }
    }
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
});
