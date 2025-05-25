import type { BuiltChatMessage } from '@/types/chat-message';
import type { ImageContent } from '@/types/chat-message';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Gets signed URLs for multiple images in a single request
 * @param paths - Array of image paths
 * @param supabase - Supabase client instance
 * @returns Promise resolving to map of path to signed URL
 */
async function getSignedUrls(
  paths: string[],
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  // Return empty map if no paths to process
  if (!paths.length) {
    return new Map();
  }

  const { data, error } = await supabase.storage
    .from('message_images')
    .createSignedUrls(paths, 60); // 1 minute expiry is enough for our use case

  if (error) {
    console.error('Error getting signed URLs:', error);
    throw error;
  }

  const urlMap = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl) {
      urlMap.set(item.path, item.signedUrl);
    }
  }
  return urlMap;
}

/**
 * Processes messages and converts image paths to base64
 * @param messages - Array of chat messages to process
 * @param supabase - Supabase client instance
 * @param selectedModel - The selected model to check if it supports images
 * @returns Promise resolving to processed messages with base64 images or images removed
 */
export async function processMessagesWithImages(
  messages: BuiltChatMessage[],
  supabase: SupabaseClient,
  selectedModel?: string,
): Promise<BuiltChatMessage[]> {
  // If model doesn't support images, remove them
  if (
    selectedModel === 'deep-research-model' ||
    selectedModel === 'reasoning-model'
  ) {
    return removeImagesFromMessages(messages);
  }

  // Collect all unique image paths that need processing
  const pathsToProcess = new Set<string>();
  messages.forEach((message) => {
    if (Array.isArray(message.content)) {
      message.content.forEach((item) => {
        if (
          item.type === 'image_url' &&
          'isPath' in item.image_url &&
          item.image_url.isPath
        ) {
          pathsToProcess.add(item.image_url.url);
        }
      });
    }
  });

  // If no paths to process, return original messages
  if (pathsToProcess.size === 0) {
    return messages;
  }

  // Get signed URLs for all images in a single request
  const signedUrls = await getSignedUrls(Array.from(pathsToProcess), supabase);

  // Process all images in parallel
  const base64Promises = Array.from(pathsToProcess).map(async (path) => {
    const signedUrl = signedUrls.get(path);
    if (!signedUrl) return null;

    try {
      const response = await fetch(signedUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const mimeType = response.headers.get('content-type') || 'image/png';
      return { path, base64: `data:${mimeType};base64,${base64}` };
    } catch (error) {
      console.error('Error processing image %s:', JSON.stringify(path), error);
      return null;
    }
  });

  // Wait for all images to be processed and create a map of results
  const base64Results = new Map(
    (await Promise.all(base64Promises))
      .filter(
        (result): result is { path: string; base64: string } => result !== null,
      )
      .map(({ path, base64 }) => [path, base64]),
  );

  // Process messages using the base64 results
  return messages.map((message) => {
    if (Array.isArray(message.content)) {
      const processedContent = message.content.map((item) => {
        if (
          item.type === 'image_url' &&
          'isPath' in item.image_url &&
          item.image_url.isPath
        ) {
          const base64 = base64Results.get(item.image_url.url);
          if (base64) {
            return {
              type: 'image_url' as const,
              image_url: {
                url: base64,
              },
            } as ImageContent;
          }
        }
        return item;
      });
      return { ...message, content: processedContent };
    }
    return message;
  });
}

/**
 * Removes images from messages when the model doesn't support them
 * @param messages - Array of chat messages to process
 * @returns Processed messages with images removed
 */
export function removeImagesFromMessages(
  messages: BuiltChatMessage[],
): BuiltChatMessage[] {
  return messages.map((message) => {
    if (Array.isArray(message.content)) {
      // Filter out image content and keep only text content
      const processedContent = message.content.filter(
        (item) => item.type !== 'image_url',
      );
      return { ...message, content: processedContent };
    }
    return message;
  });
}
