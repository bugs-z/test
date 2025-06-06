import { internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';

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
