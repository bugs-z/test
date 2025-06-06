import type { TablesInsert } from '@/supabase/types';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

if (
  !process.env.NEXT_PUBLIC_CONVEX_URL ||
  !process.env.CONVEX_SERVICE_ROLE_KEY
) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL or CONVEX_SERVICE_ROLE_KEY environment variable is not defined',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

const uploadAdminFile = async (file: File) => {
  // 20MB limit for files
  const sizeLimitMB = 20;
  const MB_TO_BYTES = (mb: number) => mb * 1024 * 1024;
  const SIZE_LIMIT = MB_TO_BYTES(sizeLimitMB);

  if (file.size > SIZE_LIMIT) {
    throw new Error(`File must be less than ${sizeLimitMB}MB`);
  }

  // Generate upload URL using Convex
  const uploadUrl = await convex.mutation(api.fileStorage.generateUploadUrl, {
    serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
  });

  if (!uploadUrl) {
    throw new Error('Failed to generate upload URL');
  }

  // Upload file to Convex storage
  const result = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!result.ok) {
    throw new Error('Failed to upload file');
  }

  const { storageId } = await result.json();
  return storageId;
};

// Helper function to convert Supabase file record to Convex format
const convertToConvexFile = (fileRecord: TablesInsert<'files'>) => {
  return {
    user_id: fileRecord.user_id,
    file_path: fileRecord.file_path,
    name: fileRecord.name,
    size: fileRecord.size,
    tokens: fileRecord.tokens || 0,
    type: fileRecord.type,
  };
};

export const createAdminFile = async (
  file: File,
  fileRecord: TablesInsert<'files'>,
  append?: boolean,
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

  let createdFile;

  // If append is true, check if a file already exists at the same location
  if (append) {
    const existingFile = await convex.query(api.files.getFile, {
      userId: fileRecord.user_id,
      fileName: validFilename,
    });

    if (existingFile) {
      // Update the existing file
      createdFile = await convex.mutation(api.files.updateFile, {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        fileId: existingFile._id,
        fileData: {
          size: file.size,
        },
      });
    }
  }

  // If no existing file was found or append is false, create a new file
  if (!createdFile) {
    createdFile = await convex.mutation(api.files.createFile, {
      serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
      fileData: {
        ...convertToConvexFile(fileRecord),
        size: file.size,
      },
    });
  }

  // Upload file to Convex storage
  const storageId = await uploadAdminFile(file);

  // Update file record with storage ID
  const finalFile = await convex.mutation(api.files.updateFile, {
    serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
    fileId: createdFile._id,
    fileData: {
      file_path: storageId,
    },
  });

  return finalFile;
};
