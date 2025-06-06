import { PentestGPTContext } from '@/context/context';
import { createFileBasedOnExtension } from '@/db/files';
import { uploadImage } from '@/db/storage/message-images';
import mammoth from 'mammoth';
import { useContext } from 'react';
import { toast } from 'sonner';
import type { Id } from '@/convex/_generated/dataModel';
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  FILE_CONTENT_TOKEN_LIMIT,
  validateFileUpload,
} from '../chat-helpers/file-constants';

interface FileProcessor {
  type: string;
  process: (file: File) => Promise<ProcessedFile>;
  simplifyType: (type: string) => string;
}

interface ProcessedFile {
  content: string | ArrayBuffer | null;
  type: string;
}

const fileProcessors: Record<string, FileProcessor> = {
  image: {
    type: 'image',
    async process(file: File) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          resolve({ content: reader.result, type: 'image' });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    simplifyType: () => 'image',
  },
  docx: {
    type: 'docx',
    async process(file: File) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { content: result.value, type: 'docx' };
    },
    simplifyType: () => 'docx',
  },
  pdf: {
    type: 'pdf',
    async process(file: File) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          resolve({ content: reader.result, type: 'pdf' });
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    },
    simplifyType: () => 'pdf',
  },
  text: {
    type: 'text',
    async process(file: File) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          resolve({ content: reader.result, type: 'txt' });
        reader.onerror = reject;
        reader.readAsText(file);
      });
    },
    simplifyType: (type: string) => {
      if (type.startsWith('text/')) return 'txt';
      return type.split('/')[1] || 'txt';
    },
  },
};

export const useSelectFileHandler = () => {
  const {
    profile,
    chatSettings,
    setNewMessageImages,
    setNewMessageFiles,
    newMessageFiles,
    newMessageImages,
  } = useContext(PentestGPTContext);

  const getFileProcessor = (file: File): FileProcessor => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

    // Only treat as image if it has both image MIME type AND supported extension
    if (
      file.type.includes('image') &&
      SUPPORTED_IMAGE_EXTENSIONS.includes(fileExtension)
    ) {
      return fileProcessors.image;
    }
    if (file.type.includes('docx') || file.type.includes('wordprocessingml'))
      return fileProcessors.docx;
    if (file.type.includes('pdf')) return fileProcessors.pdf;
    return fileProcessors.text;
  };

  const handleSelectDeviceFile = async (file: File) => {
    if (!profile || !chatSettings) return;
    if (!validateFileUpload(file, newMessageImages, newMessageFiles)) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

    // Prevent image uploads for reasoning model - but only for supported image extensions
    if (
      file.type.startsWith('image/') &&
      SUPPORTED_IMAGE_EXTENSIONS.includes(fileExtension) &&
      chatSettings.model === 'reasoning-model'
    ) {
      toast.error('Image uploads are not supported with the Reasoning Model');
      return;
    }

    const loadingId = `loading-${crypto.randomUUID()}`;
    const processor = getFileProcessor(file);

    try {
      const { content, type } = await processor.process(file);
      const simplifiedType = processor.simplifyType(file.type);

      // Only treat as image if it has both image MIME type AND supported extension
      if (
        type === 'image' &&
        file.type.startsWith('image/') &&
        SUPPORTED_IMAGE_EXTENSIONS.includes(fileExtension)
      ) {
        const imageUrl = URL.createObjectURL(file);

        // Add loading state for image
        const tempImageId = crypto.randomUUID();

        // Add image with loading state first
        setNewMessageImages((prev) => [
          ...prev,
          {
            messageId: tempImageId,
            path: '',
            base64: content as string, // Show base64 immediately for preview
            url: imageUrl,
            file, // Keep file reference
            isLoading: true, // Add loading state
          },
        ]);

        // Upload image to storage
        try {
          const path = await uploadImage(file);

          // Update image with path and remove loading state
          setNewMessageImages((prev) =>
            prev.map((img) =>
              img.messageId === tempImageId
                ? {
                    ...img,
                    path, // Store the path for later use in API requests
                    isLoading: false, // Remove loading state
                  }
                : img,
            ),
          );
        } catch (error) {
          console.error('Error uploading image:', error);
          // Update to mark upload as failed but keep the image preview
          setNewMessageImages((prev) =>
            prev.map((img) =>
              img.messageId === tempImageId
                ? {
                    ...img,
                    isLoading: false,
                    hasError: true,
                  }
                : img,
            ),
          );

          toast.error('Failed to upload image. Using local preview only.');
        }
        return;
      }

      // Handle non-image files (including images with unsupported extensions)
      setNewMessageFiles((prev) => [
        ...prev,
        {
          _id: loadingId as Id<'files'>,
          _creationTime: Date.now(),
          id: loadingId,
          name: file.name,
          type: simplifiedType,
          file_path: '',
          size: file.size,
          tokens: 0,
          user_id: profile.user_id,
          message_id: undefined,
          chat_id: undefined,
          updated_at: undefined,
          sequence_number: 0,
          content: '',
        },
      ]);

      const fileData = {
        user_id: profile.user_id,
        file_path: '',
        name: file.name,
        size: file.size,
        tokens: 0,
        type: simplifiedType,
      };

      const createdFile = await createFileBasedOnExtension(file, fileData);

      if (!createdFile) {
        toast.error(
          'File limit reached. Please delete some chats containing files.',
        );
        setNewMessageFiles((prev) => prev.filter((f) => f._id !== loadingId));
        return;
      }

      // Check total tokens after processing the new file
      const updatedFiles = [...newMessageFiles, createdFile];
      const totalTokens = updatedFiles.reduce(
        (acc, file) => acc + (file.tokens || 0),
        0,
      );

      if (totalTokens > FILE_CONTENT_TOKEN_LIMIT) {
        toast.error(
          `Adding this file would exceed the token limit of ${FILE_CONTENT_TOKEN_LIMIT}. Please upload a smaller file or remove some existing files.`,
        );
        // Remove the newly added file
        setNewMessageFiles((prev) => prev.filter((f) => f._id !== loadingId));
        return;
      }

      setNewMessageFiles((prev) =>
        prev.map((item) =>
          item._id === loadingId
            ? {
                _id: createdFile._id,
                _creationTime: Date.now(),
                name: createdFile.name,
                type: createdFile.type,
                file_path: createdFile.file_path,
                size: createdFile.size,
                tokens: createdFile.tokens,
                user_id: createdFile.user_id,
                message_id: undefined,
                chat_id: undefined,
                updated_at: undefined,
                sequence_number: 0,
                content: '',
              }
            : item,
        ),
      );
    } catch (error: any) {
      toast.error(`${error?.message}`, {
        duration: 10000,
      });
      setNewMessageImages((prev) =>
        prev.filter((img) => img.messageId !== 'temp'),
      );
      setNewMessageFiles((prev) => prev.filter((f) => f._id !== loadingId));
    }
  };

  return {
    handleSelectDeviceFile,
  };
};
