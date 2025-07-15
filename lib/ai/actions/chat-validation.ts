import { ChatSDKError } from '@/lib/errors';
import { api } from '@/convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';
import type { ChatMetadata } from '@/types';
import type { BuiltChatMessage } from '@/types/chat-message';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { checkForImagesInMessages } from '../image-processing';

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL environment variable is not defined. Please check your environment configuration.',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

/**
 * Validates chat access, rate limits, and premium features
 */
export async function validateChatAccessWithLimits({
  chatMetadata,
  userId,
  messages,
  model,
}: {
  chatMetadata: ChatMetadata;
  userId: string;
  messages: BuiltChatMessage[];
  model: string;
}): Promise<
  | {
      success: true;
      chat: any;
      config: any;
    }
  | {
      success: false;
      response: Response;
    }
> {
  // First validate rate limits and premium features
  const config = await getProviderConfig(model, { user_id: userId }, messages);

  if (!config.isRateLimitAllowed) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({
          error: {
            type: 'ratelimit_hit',
            message: config.rateLimitInfo.message,
            isPremiumUser: config.isPremiumUser,
          },
        }),
        { status: 429 },
      ),
    };
  }

  // Check if non-premium user is trying to send attachments or images
  if (!config.isPremiumUser) {
    const hasAttachments = messages.some(
      (message) => message.attachments && message.attachments.length > 0,
    );

    if (hasAttachments || checkForImagesInMessages(messages)) {
      throw new ChatSDKError('forbidden:auth');
    }
  }

  // Then validate chat access if chat exists
  const chat = await validateChatAccess({ chatMetadata, userId });

  return {
    success: true,
    chat,
    config,
  };
}

export async function validateChatAccess({
  chatMetadata,
  userId,
}: {
  chatMetadata: ChatMetadata;
  userId: string;
}) {
  if (!chatMetadata.id) {
    return null;
  }

  try {
    const chat = await convex.query(api.chats.getChatByIdWithValidation, {
      chatId: chatMetadata.id,
      userId,
    });

    return chat;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      throw new ChatSDKError('forbidden:chat');
    }
    console.error('Error validating chat access:', error);
    throw new ChatSDKError('bad_request:database');
  }
}

async function getProviderConfig(
  model: string,
  profile: any,
  _messages: any[],
) {
  // Moving away from gpt-4-turbo-preview to chat-model-large
  const modelMap: Record<string, string> = {
    'mistral-medium': 'chat-model-small',
    'mistral-large': 'chat-model-large',
    'gpt-4-turbo-preview': 'chat-model-large',
    'reasoning-model': 'reasoning-model',
  };
  // Moving away from gpt-4-turbo-preview to pentestgpt-pro
  const rateLimitModelMap: Record<string, string> = {
    'mistral-medium': 'pentestgpt',
    'mistral-large': 'pentestgpt-pro',
    'gpt-4-turbo-preview': 'pentestgpt-pro',
  };

  const selectedModel = modelMap[model];
  if (!selectedModel) {
    throw new Error('Selected model is undefined');
  }

  const isLargeModel = selectedModel.includes('large');

  const rateLimitStatus = await checkRatelimitOnApi(
    profile.user_id,
    rateLimitModelMap[model] || model,
  );

  return {
    selectedModel,
    isRateLimitAllowed: rateLimitStatus.allowed,
    isLargeModel,
    rateLimitInfo: rateLimitStatus.info,
    isPremiumUser: rateLimitStatus.info.isPremiumUser,
  };
}
