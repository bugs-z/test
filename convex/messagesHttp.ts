import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import {
  createResponse,
  createErrorResponse,
  validateAuthWithUser,
  getUrlParams,
} from './httpUtils';

/**
 * HTTP action to get messages with files for a chat
 */
export const getMessagesWithFilesHttp = httpAction(async (ctx, request) => {
  // Validate authentication with user verification
  const authResult = await validateAuthWithUser(request);
  if (!authResult.success) {
    return createErrorResponse(
      authResult.error || 'Authentication failed',
      401,
    );
  }

  try {
    // Get parameters from URL
    const params = getUrlParams(request, ['chat_id', 'numItems', 'cursor']);
    const { chat_id: chatId, numItems, cursor } = params;

    if (!chatId) {
      return createErrorResponse('Missing chat_id parameter', 400);
    }

    // Get messages with files using pagination
    const result = await ctx.runQuery(
      internal.messages.internalGetMessagesWithFiles,
      {
        chatId,
        paginationOpts: {
          numItems: numItems ? Number.parseInt(numItems) : 20,
          cursor: cursor || null,
        },
      },
    );

    return createResponse(result, 200);
  } catch (error) {
    console.error('[GET_MESSAGES_WITH_FILES] Error getting messages:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse('Internal server error', 500);
  }
});
