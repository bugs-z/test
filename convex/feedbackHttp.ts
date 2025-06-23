import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import {
  createResponse,
  createErrorResponse,
  validateAuthWithUser,
  validateUserId,
} from './httpUtils';

// Main HTTP action handler for all feedback operations
export const handleFeedbackHttp = httpAction(async (ctx, request) => {
  // Only allow POST requests
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }

  try {
    // Validate authentication with user verification
    const authResult = await validateAuthWithUser(request);
    if (!authResult.success || !authResult.user) {
      return createErrorResponse(
        authResult.error || 'Authentication failed',
        401,
      );
    }

    const { user } = authResult;

    // Parse request body
    const body = await request.json();
    const { type, ...feedbackData } = body;

    // Route based on operation type
    switch (type) {
      case 'save': {
        const {
          message_id,
          user_id,
          chat_id,
          feedback,
          reason,
          detailed_feedback,
          model,
          sequence_number,
          allow_email,
          allow_sharing,
          has_files,
          plugin,
          updated_at,
        } = feedbackData;

        // Validate required fields
        if (!message_id || !user_id || !chat_id || !feedback) {
          return createErrorResponse('Missing required parameters', 400);
        }

        // Validate user ID for feedback creation
        validateUserId(user_id, user.id);

        // Save feedback using internal mutation
        await ctx.runMutation(internal.feedback.internalSaveFeedback, {
          message_id,
          user_id,
          chat_id,
          feedback,
          reason,
          detailed_feedback,
          model,
          sequence_number,
          allow_email,
          allow_sharing,
          has_files,
          plugin,
          updated_at,
        });

        return createResponse({ success: true }, 200);
      }

      default:
        return createErrorResponse('Invalid operation type', 400);
    }
  } catch (error) {
    console.error('Error handling feedback request:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized: User ID mismatch') {
        return createErrorResponse('Unauthorized: User ID mismatch', 403);
      }
    }
    return createErrorResponse('Internal server error', 500);
  }
});
