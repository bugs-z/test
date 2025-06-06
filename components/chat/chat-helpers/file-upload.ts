import type { MessageImage } from '@/types/images/message-image';
import type { Doc } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { MAX_TOTAL_FILES } from './file-constants';

export const handleFileUpload = (
  files: File[],
  handleSelectDeviceFile: (file: File) => void,
  newMessageImages: MessageImage[] = [],
  newMessageFiles: Doc<'files'>[] = [],
) => {
  let totalFiles = newMessageImages.length + newMessageFiles.length;

  for (const file of files) {
    if (totalFiles >= MAX_TOTAL_FILES) {
      toast.error(
        `Maximum of ${MAX_TOTAL_FILES} files (including images) allowed.`,
      );
      break;
    }

    handleSelectDeviceFile(file);
    totalFiles++;
  }
};
