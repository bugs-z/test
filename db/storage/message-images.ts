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

export const processMessageImages = async (
  messages: Doc<'messages'>[],
): Promise<MessageImage[]> => {
  const imagePromises: Promise<MessageImage>[] = messages.flatMap((message) =>
    message.image_paths
      ? message.image_paths.map(async (imagePath) => {
          const url = await getImageUrl(imagePath);

          const messageImage: MessageImage = {
            messageId: message.id,
            path: imagePath,
            url: url || '',
            file: null,
          };

          return messageImage;
        })
      : [],
  );

  return await Promise.all(imagePromises.flat());
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
