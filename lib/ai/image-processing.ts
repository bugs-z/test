import type { BuiltChatMessage } from '@/types/chat-message';
import type { ImageContent } from '@/types/chat-message';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { ConvexHttpClient } from 'convex/browser';

if (
  !process.env.NEXT_PUBLIC_CONVEX_URL ||
  !process.env.CONVEX_SERVICE_ROLE_KEY
) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL or CONVEX_SERVICE_ROLE_KEY environment variable is not defined',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

/**
 * Checks if messages contain image content
 */
export function checkForImagesInMessages(
  messages: BuiltChatMessage[],
): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((item) => item.type === 'image_url'),
  );
}

/**
 * Gets URLs for multiple images from Convex storage
 */
async function getImageUrls(
  storageIds: string[],
): Promise<Map<string, string>> {
  if (!storageIds.length) return new Map();

  const urlMap = new Map<string, string>();

  const urlPromises = storageIds.map(async (storageId) => {
    try {
      if (!storageId?.trim() || storageId.includes('/')) return;

      const url = await convex.query(api.fileStorage.getFileStorageUrlPublic, {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        storageId: storageId as Id<'_storage'>,
      });

      if (url) urlMap.set(storageId, url);
    } catch (error) {
      console.error(`Error getting URL for storage ID ${storageId}:`, error);
    }
  });

  await Promise.all(urlPromises);
  return urlMap;
}

/**
 * Processes assistant images by moving them to the next user messages.
 *
 * This function:
 * 1. Extracts images from assistant messages
 * 2. Removes images from assistant messages
 * 3. Adds extracted images to the next user message
 *
 * @param messages - Array of chat messages to process
 * @returns Processed messages with assistant images moved to next user messages
 */
export function processAssistantImages(
  messages: BuiltChatMessage[],
): BuiltChatMessage[] {
  const processedMessages: BuiltChatMessage[] = [];
  let pendingAssistantImages: ImageContent[] = [];

  for (const message of messages) {
    if (message.role === 'assistant') {
      const assistantImages: ImageContent[] = [];

      // Extract images from content array
      if (Array.isArray(message.content)) {
        assistantImages.push(
          ...message.content.filter(
            (item): item is ImageContent => item.type === 'image_url',
          ),
        );
      }

      // Extract images from image_paths property (compatibility)
      if (
        'image_paths' in message &&
        Array.isArray((message as any).image_paths)
      ) {
        const imagePaths = (message as any).image_paths as string[];
        assistantImages.push(
          ...imagePaths.map((path) => ({
            type: 'image_url' as const,
            image_url: { url: path, isPath: true },
          })),
        );
      }

      pendingAssistantImages.push(...assistantImages);

      // Remove images from assistant message
      const content = Array.isArray(message.content)
        ? message.content.filter((item) => item.type !== 'image_url')
        : message.content;

      processedMessages.push({
        ...message,
        content:
          Array.isArray(message.content) && content.length === 0
            ? message.content
            : content,
      });
    } else if (message.role === 'user' && pendingAssistantImages.length > 0) {
      // Add pending images to user message
      const currentContent = Array.isArray(message.content)
        ? message.content
        : [{ type: 'text' as const, text: message.content as string }];

      processedMessages.push({
        ...message,
        content: [...currentContent, ...pendingAssistantImages],
      });

      pendingAssistantImages = [];
    } else {
      processedMessages.push(message);
    }
  }

  // Handle any remaining assistant images that weren't attached to a user message
  if (pendingAssistantImages.length > 0) {
    console.error(
      `Found ${pendingAssistantImages.length} assistant images that couldn't be moved to a user message. These images will be dropped.`,
    );
  }

  return processedMessages;
}

/**
 * Processes messages and converts image paths to URLs.
 *
 * Steps:
 * 1. Moves assistant images to next user messages
 * 2. Converts image storage IDs to URLs
 * 3. Removes images if model doesn't support them
 */
export async function processMessagesWithImages(
  messages: BuiltChatMessage[],
  selectedModel?: string,
): Promise<{
  processedMessages: BuiltChatMessage[];
  hasImageAttachments: boolean;
}> {
  const hasImageAttachments = checkForImagesInMessages(messages);

  // Process assistant images first
  const messagesWithProcessedAssistantImages = processAssistantImages(messages);

  // Remove images for models that don't support them
  if (selectedModel === 'reasoning-model') {
    return {
      processedMessages: removeImagesFromMessages(
        messagesWithProcessedAssistantImages,
      ),
      hasImageAttachments,
    };
  }

  // Collect storage IDs that need URL conversion
  const storageIds = new Set<string>();
  messagesWithProcessedAssistantImages.forEach((message) => {
    if (!Array.isArray(message.content)) return;

    message.content.forEach((item) => {
      if (
        item.type === 'image_url' &&
        'isPath' in item.image_url &&
        item.image_url.isPath
      ) {
        storageIds.add(item.image_url.url);
      }
    });
  });

  // If no storage IDs, return as-is
  if (storageIds.size === 0) {
    return {
      processedMessages: messagesWithProcessedAssistantImages,
      hasImageAttachments,
    };
  }

  // Convert storage IDs to URLs
  const imageUrls = await getImageUrls(Array.from(storageIds));

  const processedMessages = messagesWithProcessedAssistantImages.map(
    (message) => {
      if (!Array.isArray(message.content)) return message;

      const processedContent = message.content.map((item) => {
        if (
          item.type === 'image_url' &&
          'isPath' in item.image_url &&
          item.image_url.isPath
        ) {
          const url = imageUrls.get(item.image_url.url);
          return url
            ? { type: 'image_url' as const, image_url: { url } }
            : item;
        }
        return item;
      });

      return { ...message, content: processedContent };
    },
  );

  return { processedMessages, hasImageAttachments };
}

/**
 * Removes images from messages when the model doesn't support them
 */
export function removeImagesFromMessages(
  messages: BuiltChatMessage[],
): BuiltChatMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;

    return {
      ...message,
      content: message.content.filter((item) => item.type !== 'image_url'),
    };
  });
}
