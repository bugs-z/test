import {
  internalQuery,
  mutation,
  query,
  internalMutation,
} from './_generated/server';
import { v } from 'convex/values';

/**
 * Helper function to delete a file and its associated data
 * Handles deletion from storage, file_items cleanup, and file record removal
 */
export const deleteFileAndAssociatedData = internalMutation({
  args: {
    fileId: v.optional(v.id('files')),
    storageId: v.optional(v.id('_storage')),
    identifier: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    try {
      // Delete file from storage if storage ID is provided
      if (args.storageId) {
        await ctx.storage.delete(args.storageId);
      }

      // Delete file record and associated file_items if file ID is provided
      if (args.fileId) {
        // Find and delete all file_items that reference this file
        const fileItems = await ctx.db
          .query('file_items')
          .withIndex('by_file_id', (q: any) => q.eq('file_id', args.fileId))
          .collect();

        for (const fileItem of fileItems) {
          await ctx.db.delete(fileItem._id);
        }

        // Delete the file record itself
        await ctx.db.delete(args.fileId);
      }
    } catch (fileError) {
      console.warn(
        `Failed to delete file ${args.identifier || args.fileId || args.storageId}:`,
        fileError,
      );
      // Continue with other deletions even if one file fails
    }
  },
});

/**
 * Generate upload URL for admin file uploads
 */
export const generateUploadUrl = mutation({
  args: {
    serviceKey: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return null;
    }

    try {
      const uploadUrl = await ctx.storage.generateUploadUrl();
      return uploadUrl;
    } catch (error) {
      console.error('[STORAGE] Failed to generate upload URL', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
});

/**
 * Get file/image URL from storage ID (public function)
 */
export const getFileStorageUrlPublic = query({
  args: {
    serviceKey: v.string(),
    storageId: v.id('_storage'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return null;
    }

    try {
      const url = await ctx.storage.getUrl(args.storageId);
      return url;
    } catch (error) {
      console.error('[STORAGE] Failed to get file URL', {
        error: error instanceof Error ? error.message : String(error),
        storageId: args.storageId,
      });
      return null;
    }
  },
});

/**
 * Get file/image URL from storage ID (internal function)
 */
export const getFileStorageUrl = internalQuery({
  args: {
    storageId: v.id('_storage'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const url = await ctx.storage.getUrl(args.storageId);
      return url;
    } catch (error) {
      console.error('[STORAGE] Failed to get file URL', {
        error: error instanceof Error ? error.message : String(error),
        storageId: args.storageId,
      });
      return null;
    }
  },
});

/**
 * Get multiple file/image URLs from storage IDs in a single batch request (public function)
 */
export const getBatchFileStorageUrlsPublic = query({
  args: {
    serviceKey: v.string(),
    storageIds: v.array(v.id('_storage')),
  },
  returns: v.array(
    v.object({
      storageId: v.id('_storage'),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return [];
    }

    const results = [];

    for (const storageId of args.storageIds) {
      try {
        const url = await ctx.storage.getUrl(storageId);
        results.push({
          storageId,
          url,
        });
      } catch (error) {
        console.error('[STORAGE] Failed to get file URL in batch', {
          error: error instanceof Error ? error.message : String(error),
          storageId,
        });
        results.push({
          storageId,
          url: null,
        });
      }
    }

    return results;
  },
});

/**
 * Get multiple file/image URLs from storage IDs in a single batch request (internal function)
 */
export const getBatchFileStorageUrls = internalQuery({
  args: {
    storageIds: v.array(v.id('_storage')),
  },
  returns: v.array(
    v.object({
      storageId: v.id('_storage'),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const results = [];

    for (const storageId of args.storageIds) {
      try {
        const url = await ctx.storage.getUrl(storageId);
        results.push({
          storageId,
          url,
        });
      } catch (error) {
        console.error('[STORAGE] Failed to get file URL in batch', {
          error: error instanceof Error ? error.message : String(error),
          storageId,
        });
        results.push({
          storageId,
          url: null,
        });
      }
    }

    return results;
  },
});
