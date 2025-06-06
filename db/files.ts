import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { TablesInsert } from '@/supabase/types';
import mammoth from 'mammoth';
import { toast } from 'sonner';
import { uploadFile } from '@/db/storage/files';
import type { Id } from '@/convex/_generated/dataModel';
import { makeAuthenticatedRequest } from '@/lib/api/convex';

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not defined');
}

const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export const getFileById = async (fileId: Id<'files'>) => {
  const file = await convex.query(api.files.getFile, { fileId });

  if (!file) {
    throw new Error('File not found');
  }

  return file;
};

export const createFileBasedOnExtension = async (
  file: File,
  fileRecord: TablesInsert<'files'>,
) => {
  const fileExtension = file.name.split('.').pop();

  if (fileExtension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({
      arrayBuffer,
    });

    return createDocXFile(result.value, file, fileRecord);
  } else {
    return createFile(file, fileRecord);
  }
};

// Base function for common file creation logic
const createBaseFile = async (
  file: File,
  fileRecord: TablesInsert<'files'>,
  processFile: (fileId: Id<'files'>) => Promise<void>,
) => {
  try {
    // Use the new uploadFileWithRecord function that handles both file upload and database record creation
    const result = await uploadFile(file, {
      name: fileRecord.name,
      size: file.size,
      tokens: fileRecord.tokens,
      type: fileRecord.type,
    });

    const createdFile = result.file;

    try {
      await processFile(createdFile._id);
    } catch (error) {
      await deleteFile(createdFile._id);
      throw error;
    }

    const fetchedFile = await getFileById(createdFile._id);
    await getFileItemsByFileId(createdFile._id);

    return fetchedFile;
  } catch (error) {
    console.error('Error in createBaseFile:', error);
    throw error;
  }
};

// For non-docx files
export const createFile = async (
  file: File,
  fileRecord: TablesInsert<'files'>,
) => {
  let validFilename = fileRecord.name
    .replace(/[^a-z0-9.]/gi, '_')
    .toLowerCase();
  const extension = validFilename.split('.').pop();
  const baseName = validFilename.substring(0, validFilename.lastIndexOf('.'));
  const maxBaseNameLength = 100 - (extension?.length || 0) - 1;
  if (baseName.length > maxBaseNameLength) {
    validFilename = `${baseName.substring(0, maxBaseNameLength)}.${extension}`;
  }
  fileRecord.name = validFilename;

  return createBaseFile(file, fileRecord, async (fileId) => {
    const formData = new FormData();
    formData.append('file_id', fileId);

    const response = await fetch('/api/retrieval/process', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const jsonText = await response.text();
      const json = JSON.parse(jsonText);
      console.error(
        `Error processing file:${fileId}, status:${response.status}, response:${json.message}`,
      );
      throw new Error(
        `Failed to process file (${fileRecord.name}): ${json.message}`,
      );
    }
  });
};

// Handle docx files
export const createDocXFile = async (
  text: string,
  file: File,
  fileRecord: TablesInsert<'files'>,
) => {
  return createBaseFile(file, fileRecord, async (fileId) => {
    const response = await fetch('/api/retrieval/process/docx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        fileId: fileId,
        fileExtension: 'docx',
      }),
    });

    if (!response.ok) {
      const jsonText = await response.text();
      const json = JSON.parse(jsonText);
      console.error(
        `Error processing file:${fileId}, status:${response.status}, response:${json.message}`,
      );
      toast.error(`Failed to process file. Reason:${json.message}`, {
        duration: 10000,
      });
      throw new Error(`Failed to process file: ${json.message}`);
    }
  });
};

export const deleteFile = async (fileId: Id<'files'>) => {
  try {
    const result = await makeAuthenticatedRequest(
      '/api/delete-storage-item',
      'POST',
      {
        fileId,
        type: 'file',
      },
    );

    if (!result?.success) {
      throw new Error(result?.message || 'Failed to delete file');
    }

    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

export const getFileItemsByFileId = async (fileId: Id<'files'>) => {
  const fileItems = await convex.query(api.file_items.getFileItemsByFileId, {
    fileId: fileId,
  });

  return fileItems;
};
