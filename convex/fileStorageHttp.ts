import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { api } from './_generated/api';
import {
  createResponse,
  createErrorResponse,
  validateAuthWithUser,
} from './httpUtils';
import type { Id } from './_generated/dataModel';

/**
 * Interface for file metadata structure
 */
interface FileMetadata {
  name?: string;
  tokens?: number;
  type?: string;
}

/**
 * HTTP action to upload images to Convex storage
 */
export const uploadImageHttp = httpAction(async (ctx, request) => {
  // Validate authentication with user verification
  const authResult = await validateAuthWithUser(request);
  if (!authResult.success || !authResult.user) {
    return createErrorResponse(
      authResult.error || 'Authentication failed',
      401,
    );
  }

  try {
    // Check user subscription before allowing upload
    const subscriptionInfo = await ctx.runQuery(
      api.subscriptions.checkSubscription,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        userId: authResult.user.id,
      },
    );

    if (subscriptionInfo.planType === 'free') {
      return createErrorResponse(
        'File uploads are only available for Pro and Team users. Please upgrade your subscription to upload images.',
        403,
      );
    }

    // Store the image file
    const blob = await request.blob();

    // Validate file size (5MB limit)
    const imageSizeLimit = 5000000; // 5MB
    if (blob.size > imageSizeLimit) {
      return createErrorResponse(
        `Image must be less than ${imageSizeLimit / 1000000}MB`,
        400,
      );
    }

    const storageId = await ctx.storage.store(blob);

    return createResponse(
      {
        success: true,
        storageId,
      },
      200,
    );
  } catch (error) {
    console.error('[UPLOAD_IMAGE] Error uploading image:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse('Internal server error', 500);
  }
});

/**
 * HTTP action to get URLs from Convex storage for both files and images
 */
export const getStorageUrlHttp = httpAction(async (ctx, request) => {
  // Validate authentication with user verification
  const authResult = await validateAuthWithUser(request);
  if (!authResult.success) {
    return createErrorResponse(
      authResult.error || 'Authentication failed',
      401,
    );
  }

  try {
    // Parse request body to get storageId
    const body = await request.json();
    const { storageId } = body;

    if (!storageId) {
      return createErrorResponse('Missing storageId parameter', 400);
    }

    // Get URL from storage using the internal function
    const url = await ctx.runQuery(internal.fileStorage.getFileStorageUrl, {
      storageId: storageId as Id<'_storage'>,
    });

    if (!url) {
      return createErrorResponse('Storage item not found', 404);
    }

    return createResponse({ url }, 200);
  } catch (error) {
    console.error('Error getting storage URL:', error);
    return createErrorResponse('Internal server error', 500);
  }
});

/**
 * HTTP action to get multiple URLs from Convex storage in a single batch request
 */
export const getBatchStorageUrlsHttp = httpAction(async (ctx, request) => {
  // Validate authentication with user verification
  const authResult = await validateAuthWithUser(request);
  if (!authResult.success) {
    return createErrorResponse(
      authResult.error || 'Authentication failed',
      401,
    );
  }

  try {
    // Parse request body to get storageIds
    const body = await request.json();
    const { storageIds } = body;

    if (!storageIds || !Array.isArray(storageIds)) {
      return createErrorResponse(
        'Missing or invalid storageIds parameter',
        400,
      );
    }

    if (storageIds.length === 0) {
      return createResponse({ urls: [] }, 200);
    }

    // Validate storageIds array length to prevent abuse
    if (storageIds.length > 50) {
      return createErrorResponse(
        'Maximum 50 storage IDs allowed per batch request',
        400,
      );
    }

    // Get URLs from storage using the internal batch function
    const results = await ctx.runQuery(
      internal.fileStorage.getBatchFileStorageUrls,
      {
        storageIds: storageIds as Id<'_storage'>[],
      },
    );

    return createResponse({ urls: results }, 200);
  } catch (error) {
    console.error('Error getting batch storage URLs:', error);
    return createErrorResponse('Internal server error', 500);
  }
});

/**
 * HTTP action to upload files with complete database record creation
 */
export const uploadFileHttp = httpAction(async (ctx, request) => {
  // Validate authentication with user verification
  const authResult = await validateAuthWithUser(request);
  if (!authResult.success || !authResult.user) {
    return createErrorResponse(
      authResult.error || 'Authentication failed',
      401,
    );
  }

  try {
    // Check user subscription before allowing upload
    const subscriptionInfo = await ctx.runQuery(
      api.subscriptions.checkSubscription,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        userId: authResult.user.id,
      },
    );

    if (subscriptionInfo.planType === 'free') {
      return createErrorResponse(
        'File uploads are only available for Pro and Team users. Please upgrade your subscription to upload files.',
        403,
      );
    }

    // Parse form data to get file and metadata
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileMetadata = formData.get('metadata') as string;

    if (!file) {
      return createErrorResponse('No file provided', 400);
    }

    if (!fileMetadata) {
      return createErrorResponse('No file metadata provided', 400);
    }

    let parsedMetadata: FileMetadata;
    try {
      parsedMetadata = JSON.parse(fileMetadata) as FileMetadata;
    } catch (_error) {
      return createErrorResponse('Invalid metadata format', 400);
    }

    // Validate file size (20MB limit for files)
    const fileSizeLimitMB = 20;
    const fileSizeLimit = fileSizeLimitMB * 1024 * 1024; // Convert MB to bytes
    if (file.size > fileSizeLimit) {
      return createErrorResponse(
        `File must be less than ${fileSizeLimitMB}MB`,
        400,
      );
    }

    // Check file count limit
    const filesCounts = await ctx.runQuery(
      internal.files.internalGetAllFilesCount,
      {
        userId: authResult.user.id,
      },
    );
    const maxFiles = 500;
    if (filesCounts >= maxFiles) {
      return createErrorResponse(
        `File limit reached. Maximum ${maxFiles} files allowed.`,
        400,
      );
    }

    // Store the file in Convex storage
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const storageId = await ctx.storage.store(blob);

    // Create file record in database
    const fileData = {
      user_id: authResult.user.id,
      file_path: storageId, // Initially set to storageId, will be updated
      name: parsedMetadata.name || file.name,
      size: file.size,
      tokens: parsedMetadata.tokens || 0,
      type: parsedMetadata.type || file.type,
    };

    const createdFile = await ctx.runMutation(
      internal.files.internalCreateFile,
      {
        fileData,
      },
    );

    // Update file record with the storage ID as file_path
    const updatedFile = await ctx.runMutation(
      internal.files.internalUpdateFile,
      {
        fileId: createdFile._id,
        fileData: {
          file_path: storageId,
        },
      },
    );

    return createResponse(
      {
        success: true,
        file: updatedFile,
        storageId,
      },
      200,
    );
  } catch (error) {
    console.error('[UPLOAD_FILE_WITH_RECORD] Error uploading file:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse('Internal server error', 500);
  }
});

/**
 * HTTP action to delete files or images from Convex storage
 * Handles both file deletion (with database cleanup) and direct image deletion
 */
export const deleteStorageItemHttp = httpAction(async (ctx, request) => {
  // Validate authentication with user verification
  const authResult = await validateAuthWithUser(request);
  if (!authResult.success || !authResult.user) {
    return createErrorResponse(
      authResult.error || 'Authentication failed',
      401,
    );
  }

  try {
    // Parse request body to get parameters
    const body = await request.json();
    const { fileId, storageId, type } = body;

    // Handle file deletion (includes database cleanup)
    if (type === 'file') {
      if (!fileId) {
        return createErrorResponse('Missing fileId for file deletion', 400);
      }

      // Use the existing deleteFile mutation which handles storage deletion
      const success = await ctx.runMutation(internal.files.deleteFile, {
        fileId: fileId as Id<'files'>,
      });

      if (!success) {
        return createErrorResponse('Failed to delete file', 500);
      }

      return createResponse(
        {
          success: true,
          message: 'File deleted successfully',
          type: 'file',
        },
        200,
      );
    }

    // Handle direct image deletion (storage only)
    if (type === 'image') {
      if (!storageId) {
        return createErrorResponse('Missing storageId for image deletion', 400);
      }

      // Delete image from Convex storage
      try {
        await ctx.storage.delete(storageId as Id<'_storage'>);
      } catch (storageError) {
        console.error(
          `Failed to delete image from storage: ${storageId}`,
          storageError,
        );
        return createErrorResponse('Failed to delete image from storage', 500);
      }

      return createResponse(
        {
          success: true,
          message: 'Image deleted successfully',
          type: 'image',
        },
        200,
      );
    }

    return createErrorResponse(
      'Invalid or missing type parameter. Must be "file" or "image"',
      400,
    );
  } catch (error) {
    console.error('[DELETE_STORAGE_ITEM] Error deleting storage item:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse('Internal server error', 500);
  }
});
