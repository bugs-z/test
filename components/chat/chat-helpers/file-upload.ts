import type { MessageImage } from '@/types/images/message-image';
import type { Doc } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  MAX_TOTAL_FILES,
  calculateTotalFileCount,
  validateFileUpload,
} from './file-constants';

export const handleFileUpload = (
  files: File[],
  handleSelectDeviceFile: (file: File) => void,
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
) => {
  let currentTotalFiles = calculateTotalFileCount(
    newMessageImages,
    newMessageFiles,
  );

  for (const file of files) {
    if (currentTotalFiles >= MAX_TOTAL_FILES) {
      toast.error(
        `Maximum of ${MAX_TOTAL_FILES} files (including images) allowed.`,
      );
      break;
    }

    // Use unified validation function
    if (!validateFileUpload(file, newMessageImages, newMessageFiles)) {
      break;
    }

    handleSelectDeviceFile(file);
    currentTotalFiles++;
  }
};
