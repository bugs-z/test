import type { BuiltChatMessage } from '@/types/chat-message';
import type { ImageContent } from '@/types/chat-message';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { ConvexHttpClient } from 'convex/browser';
import { processImagesForPentest } from './pentest-files';

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
 * Gets URLs for multiple images from Convex storage using batch request
 */
export async function getImageUrls(
  storageIds: string[],
): Promise<Map<string, string>> {
  if (!storageIds.length) return new Map();

  const urlMap = new Map<string, string>();

  // Filter out invalid storage IDs
  const validStorageIds = storageIds.filter(
    (storageId) => storageId?.trim() && !storageId.includes('/'),
  );

  if (validStorageIds.length === 0) return urlMap;

  try {
    const results = await convex.query(
      api.fileStorage.getBatchFileStorageUrlsPublic,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        storageIds: validStorageIds as Id<'_storage'>[],
      },
    );

    for (const result of results) {
      if (result.url) {
        urlMap.set(result.storageId, result.url);
      }
    }
  } catch (error) {
    console.error('Error getting batch image URLs:', error);
  }

  return urlMap;
}

/**
 * Configuration for image processing limits
 */
const IMAGE_PROCESSING_CONFIG = {
  MAX_IMAGE_SIZE_MB: 20, // Maximum image size in MB
  FETCH_TIMEOUT_MS: 30000, // 30 second timeout for each fetch
} as const;

/**
 * Fetches image data with timeout and size validation
 */
async function fetchImageWithLimits(
  url: string,
  storageId: string,
  timeoutMs: number,
  maxSizeMB: number,
): Promise<{ storageId: string; dataUrl?: string; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // Add cache control to prevent stale responses
      cache: 'no-cache',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        storageId,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Check content length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength, 10) / (1024 * 1024);
      if (sizeInMB > maxSizeMB) {
        return {
          storageId,
          error: `Image size ${sizeInMB.toFixed(2)}MB exceeds limit of ${maxSizeMB}MB`,
        };
      }
    }

    const arrayBuffer = await response.arrayBuffer();

    // Double-check actual size after download
    const actualSizeInMB = arrayBuffer.byteLength / (1024 * 1024);
    if (actualSizeInMB > maxSizeMB) {
      return {
        storageId,
        error: `Image size ${actualSizeInMB.toFixed(2)}MB exceeds limit of ${maxSizeMB}MB`,
      };
    }

    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    // Determine MIME type from response headers or default to image/jpeg
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${contentType};base64,${base64}`;

    return { storageId, dataUrl };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { storageId, error: `Request timed out after ${timeoutMs}ms` };
      }
      return { storageId, error: error.message };
    }

    return { storageId, error: 'Unknown error occurred' };
  }
}

/**
 * Gets image data as base64 from Convex storage with concurrency control, size limits, and timeout handling
 */
export async function getImageDataAsBase64(
  storageIds: string[],
): Promise<Map<string, string>> {
  if (!storageIds.length) return new Map();

  const base64Map = new Map<string, string>();

  // Filter out invalid storage IDs
  const validStorageIds = storageIds.filter(
    (storageId) => storageId?.trim() && !storageId.includes('/'),
  );

  if (validStorageIds.length === 0) return base64Map;

  try {
    // First get the URLs
    const urlResults = await convex.query(
      api.fileStorage.getBatchFileStorageUrlsPublic,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        storageIds: validStorageIds as Id<'_storage'>[],
      },
    );

    // Process images with size limits and timeout handling
    const results = await Promise.all(
      urlResults.map(async (result) => {
        if (!result.url)
          return { storageId: result.storageId, error: 'No URL available' };

        return await fetchImageWithLimits(
          result.url,
          result.storageId,
          IMAGE_PROCESSING_CONFIG.FETCH_TIMEOUT_MS,
          IMAGE_PROCESSING_CONFIG.MAX_IMAGE_SIZE_MB,
        );
      }),
    );

    // Process results and log any errors
    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.dataUrl) {
        base64Map.set(result.storageId, result.dataUrl);
        successCount++;
      } else if (result.error) {
        console.warn(
          `Failed to process image ${result.storageId}: ${result.error}`,
        );
        errorCount++;
      }
    }
  } catch (error) {
    console.error('Error getting batch image data as base64:', error);
  }

  return base64Map;
}

/**
 * Extracts images from assistant messages and returns them with cleaned message
 */
function extractAssistantImages(message: BuiltChatMessage): {
  images: ImageContent[];
  cleanedMessage: BuiltChatMessage;
} {
  const images: ImageContent[] = [];

  // Extract images from content array
  if (Array.isArray(message.content)) {
    images.push(
      ...message.content.filter(
        (item): item is ImageContent => item.type === 'image_url',
      ),
    );
  }

  // Extract images from image_paths property (legacy compatibility)
  if ('image_paths' in message && Array.isArray((message as any).image_paths)) {
    const imagePaths = (message as any).image_paths as string[];
    images.push(
      ...imagePaths.map((path) => ({
        type: 'image_url' as const,
        image_url: { url: path },
      })),
    );
  }

  // Remove images from message content
  const cleanedContent = Array.isArray(message.content)
    ? message.content.filter((item) => item.type !== 'image_url')
    : message.content;

  return {
    images,
    cleanedMessage: {
      ...message,
      content:
        Array.isArray(message.content) && cleanedContent.length === 0
          ? message.content
          : cleanedContent,
    },
  };
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
      const { images, cleanedMessage } = extractAssistantImages(message);
      pendingAssistantImages.push(...images);
      processedMessages.push(cleanedMessage);
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
    console.warn(
      `Found ${pendingAssistantImages.length} assistant images that couldn't be moved to a user message. These images will be dropped.`,
    );
  }

  return processedMessages;
}

/**
 * Collects storage IDs from messages that need URL conversion
 */
function collectStorageIds(messages: BuiltChatMessage[]): {
  storageIds: Set<string>;
  storageIdToImageContent: Map<
    string,
    { message: BuiltChatMessage; item: any }
  >;
} {
  const storageIds = new Set<string>();
  const storageIdToImageContent = new Map<
    string,
    { message: BuiltChatMessage; item: any }
  >();

  messages.forEach((message) => {
    if (!Array.isArray(message.content)) return;

    message.content.forEach((item) => {
      if (item.type === 'image_url') {
        storageIds.add(item.image_url.url);
        storageIdToImageContent.set(item.image_url.url, { message, item });
      }
    });
  });

  return { storageIds, storageIdToImageContent };
}

/**
 * Processes message content for normal mode, converting storage IDs to base64 data URLs
 */
function processNormalModeContentWithBase64(
  message: BuiltChatMessage,
  imageBase64Data: Map<string, string>,
): BuiltChatMessage {
  if (!Array.isArray(message.content)) return message;

  const processedContent = message.content.map((item) => {
    if (item.type === 'image_url') {
      const base64Data = imageBase64Data.get(item.image_url.url);
      return base64Data
        ? { type: 'image_url' as const, image_url: { url: base64Data } }
        : item;
    }
    return item;
  });

  return { ...message, content: processedContent };
}

/**
 * Processes message content for terminal mode, reorganizing images and text with base64 data
 */
function processTerminalModeContentWithBase64(
  message: BuiltChatMessage,
  imageBase64Data: Map<string, string>,
): BuiltChatMessage {
  if (!Array.isArray(message.content) || message.role !== 'user') {
    return message;
  }

  const processedContent: any[] = [];
  const imageContents: any[] = [];

  // Convert storage IDs to base64 data URLs and separate content types
  message.content.forEach((item) => {
    if (item.type === 'image_url') {
      let processedItem = item;
      const base64Data = imageBase64Data.get(item.image_url.url);
      if (base64Data) {
        processedItem = {
          type: 'image_url' as const,
          image_url: { url: base64Data },
        };
      }
      imageContents.push(processedItem);
    } else {
      processedContent.push(item);
    }
  });

  // Add non-image content first, then images
  return {
    ...message,
    content: [...processedContent, ...imageContents],
  };
}

/**
 * Unified image processing function that handles both base64 conversion and pentest file creation
 * @param messages - The chat messages to process
 * @param selectedModel - The selected model (for filtering)
 * @param localPath - Optional local path for pentest files (indicates terminal mode)
 * @returns Object with processed messages, image attachments flag, and optional pentest files
 */
export async function processMessagesWithImagesUnified(
  messages: BuiltChatMessage[],
  selectedModel?: string,
  localPath?: string,
): Promise<{
  processedMessages: BuiltChatMessage[];
  hasImageAttachments: boolean;
  pentestImageFiles?: Array<{ path: string; data: Buffer }>;
}> {
  const hasImageAttachments = checkForImagesInMessages(messages);
  const isTerminalMode = !!localPath;

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

  // Collect storage IDs that need conversion
  const { storageIds } = collectStorageIds(
    messagesWithProcessedAssistantImages,
  );

  // If no storage IDs, return as-is
  if (storageIds.size === 0) {
    return {
      processedMessages: messagesWithProcessedAssistantImages,
      hasImageAttachments,
    };
  }

  // Convert storage IDs to base64 data URLs (single batch call)
  const imageBase64Data = await getImageDataAsBase64(Array.from(storageIds));

  // Process messages with base64 conversion
  const processedMessages = messagesWithProcessedAssistantImages.map(
    (message) =>
      isTerminalMode
        ? processTerminalModeContentWithBase64(message, imageBase64Data)
        : processNormalModeContentWithBase64(message, imageBase64Data),
  );

  // Handle pentest files if localPath is provided
  let pentestImageFiles: Array<{ path: string; data: Buffer }> | undefined;
  if (localPath) {
    try {
      // For pentest files, we still need URLs to download the images
      const imageUrls = await getImageUrls(Array.from(storageIds));
      const result = await processImagesForPentest(
        messages,
        messagesWithProcessedAssistantImages, // Use original messages for pentest processing
        imageUrls,
        localPath,
      );
      pentestImageFiles = result.pentestImageFiles;
    } catch (error) {
      console.error('Error processing images for pentest:', error);
    }
  }

  return { processedMessages, hasImageAttachments, pentestImageFiles };
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
