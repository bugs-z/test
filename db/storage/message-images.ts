import { makeAuthenticatedRequest } from '@/lib/api/convex';
import type { MessageImage } from '@/types';
import type { Doc } from '@/convex/_generated/dataModel';

export const uploadImage = async (image: File): Promise<string> => {
  const imageSizeLimit = 5000000; // 5MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`);
  }

  try {
    // Use makeAuthenticatedRequest with file upload support
    // Backend will extract user ID from the authentication token
    const result = await makeAuthenticatedRequest(
      `/api/upload-image`,
      'POST',
      image,
      {
        'Content-Type': image.type,
      },
    );

    if (!result?.success) {
      throw new Error(result?.error || 'Upload failed');
    }

    return result.storageId;
  } catch (error) {
    console.error('Error uploading image to Convex:', error);
    throw error;
  }
};

export const getImageUrl = async (storageId: string): Promise<string> => {
  try {
    // Validate storageId before making API call
    if (!storageId || storageId.trim() === '') {
      return '';
    }

    // Check if storageId contains "/" which indicates it's a Supabase path with UUIDs
    if (storageId.includes('/')) {
      return '';
    }

    const result = await makeAuthenticatedRequest(
      `/api/get-storage-url`,
      'POST',
      { storageId },
    );

    return result?.url || '';
  } catch (error) {
    console.error('Error getting image URL from Convex:', error);
    return '';
  }
};

/**
 * Get multiple image URLs in a single batch request for better performance
 */
export const getBatchImageUrls = async (
  storageIds: string[],
): Promise<Record<string, string>> => {
  try {
    // Filter out invalid storage IDs
    const validStorageIds = storageIds.filter(
      (id) => id && id.trim() !== '' && !id.includes('/'),
    );

    if (validStorageIds.length === 0) {
      return {};
    }

    const result = await makeAuthenticatedRequest(
      `/api/get-batch-storage-urls`,
      'POST',
      { storageIds: validStorageIds },
    );

    if (!result?.urls || !Array.isArray(result.urls)) {
      console.error('Invalid response from batch storage URLs endpoint');
      return {};
    }

    // Convert array response to object for easy lookup
    const urlMap: Record<string, string> = {};
    result.urls.forEach((item: { storageId: string; url: string | null }) => {
      if (item.url) {
        urlMap[item.storageId] = item.url;
      }
    });

    return urlMap;
  } catch (error) {
    console.error('Error getting batch image URLs from Convex:', error);
    return {};
  }
};

export const processMessageImages = async (
  messages: Doc<'messages'>[],
): Promise<MessageImage[]> => {
  // Collect all unique image paths from all messages
  const allImagePaths = new Set<string>();
  messages.forEach((message) => {
    if (message.image_paths) {
      message.image_paths.forEach((path) => allImagePaths.add(path));
    }
  });

  // Get all URLs in a single batch request
  const urlMap = await getBatchImageUrls(Array.from(allImagePaths));

  // Process messages with the cached URL map
  const messageImages: MessageImage[] = [];

  messages.forEach((message) => {
    if (message.image_paths) {
      message.image_paths.forEach((imagePath) => {
        const messageImage: MessageImage = {
          messageId: message.id,
          path: imagePath,
          url: urlMap[imagePath] || '',
          file: null,
        };
        messageImages.push(messageImage);
      });
    }
  });

  return messageImages;
};

export const deleteImage = async (storageId: string): Promise<boolean> => {
  try {
    const result = await makeAuthenticatedRequest(
      '/api/delete-storage-item',
      'POST',
      {
        storageId,
        type: 'image',
      },
    );

    if (!result?.success) {
      throw new Error(result?.message || 'Failed to delete image');
    }

    return true;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};
