import type { MessageImage } from '@/types/images/message-image';
import type { Doc } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';

// Only these specific extensions will be treated as images
export const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Maximum total files allowed
export const MAX_TOTAL_FILES = 5;

// Maximum total file size allowed (32MB in bytes)
export const MAX_TOTAL_FILE_SIZE = 32 * 1024 * 1024; // 32MB in bytes

// Individual file size limit (20MB in bytes)
export const MAX_INDIVIDUAL_FILE_SIZE = 20 * 1024 * 1024; // 20MB in bytes

// Maximum total tokens from file content
export const FILE_CONTENT_TOKEN_LIMIT = 24000;

/**
 * Calculate the total number of files (images + regular files)
 */
export const calculateTotalFileCount = (
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
): number => {
  return newMessageImages.length + newMessageFiles.length;
};

/**
 * Calculate the total size of all files (images + regular files) in bytes
 */
export const calculateTotalFileSize = (
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
): number => {
  let totalSize = 0;

  // Add size from existing message images
  newMessageImages.forEach((image) => {
    if (image.file) {
      totalSize += image.file.size;
    }
  });

  // Add size from existing message files
  newMessageFiles.forEach((file) => {
    totalSize += file.size;
  });

  return totalSize;
};

/**
 * Check if adding a file would exceed the total file count limit
 */
export const wouldExceedFileCountLimit = (
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
): boolean => {
  return (
    calculateTotalFileCount(newMessageImages, newMessageFiles) >=
    MAX_TOTAL_FILES
  );
};

/**
 * Check if adding a file would exceed the total size limit
 */
export const wouldExceedSizeLimit = (
  fileSize: number,
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
): boolean => {
  const currentTotalSize = calculateTotalFileSize(
    newMessageImages,
    newMessageFiles,
  );
  return currentTotalSize + fileSize > MAX_TOTAL_FILE_SIZE;
};

/**
 * Get remaining space in MB
 */
export const getRemainingSpaceMB = (
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
): number => {
  const currentTotalSize = calculateTotalFileSize(
    newMessageImages,
    newMessageFiles,
  );
  const remainingSize = MAX_TOTAL_FILE_SIZE - currentTotalSize;
  return Math.max(0, remainingSize / (1024 * 1024));
};

/**
 * Comprehensive file validation with toast error messages
 * Returns true if file is valid, false if validation fails
 */
export const validateFileUpload = (
  file: File,
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
  tokenLimit: number = FILE_CONTENT_TOKEN_LIMIT,
): boolean => {
  // Check total file count limit first
  if (wouldExceedFileCountLimit(newMessageImages, newMessageFiles)) {
    toast.error(
      `Maximum of ${MAX_TOTAL_FILES} files (including images) allowed.`,
    );
    return false;
  }

  // Individual file size limit
  if (file.size > MAX_INDIVIDUAL_FILE_SIZE) {
    const sizeLimitMB = MAX_INDIVIDUAL_FILE_SIZE / (1024 * 1024);
    toast.error(`File must be less than ${sizeLimitMB}MB`);
    return false;
  }

  // Check if adding this file would exceed the total size limit
  if (wouldExceedSizeLimit(file.size, newMessageImages, newMessageFiles)) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const totalSizeMB = (MAX_TOTAL_FILE_SIZE / (1024 * 1024)).toFixed(0);
    const sizeLimitMB = MAX_INDIVIDUAL_FILE_SIZE / (1024 * 1024);

    // If the single file itself exceeds the total limit
    if (file.size > MAX_TOTAL_FILE_SIZE) {
      toast.error(
        `"${file.name}" (${fileSizeMB}MB) exceeds the ${totalSizeMB}MB total size limit. Maximum individual file size is ${sizeLimitMB}MB.`,
      );
    } else {
      // If the file would exceed the limit when combined with existing files
      const remainingSizeMB = getRemainingSpaceMB(
        newMessageImages,
        newMessageFiles,
      ).toFixed(1);

      toast.error(
        `Adding "${file.name}" (${fileSizeMB}MB) would exceed the ${totalSizeMB}MB total size limit. Only ${remainingSizeMB}MB remaining.`,
      );
    }
    return false;
  }

  // Token limit check (now with default value)
  const totalTokens = newMessageFiles.reduce(
    (acc, file) => acc + (file.tokens || 0),
    0,
  );
  if (totalTokens >= tokenLimit) {
    toast.error(
      `Total tokens (${totalTokens}) exceeds the limit of ${tokenLimit}. Please upload fewer files or reduce content.`,
    );
    return false;
  }

  return true;
};
