import { supabase } from '@/lib/supabase/browser-client';
import type { Tables, TablesInsert, TablesUpdate } from '@/supabase/types';
import mammoth from 'mammoth';
import { toast } from 'sonner';
import { uploadFile } from '@/db/storage/files';

export const getFileById = async (fileId: string) => {
  const { data: file, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (!file) {
    throw new Error(error.message);
  }

  return file;
};

export const getAllFilesCount = async () => {
  const { count, error } = await supabase
    .from('files')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(error.message);
  }

  return count;
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
  processFile: (fileId: string) => Promise<void>,
) => {
  const filesCounts = (await getAllFilesCount()) || 0;
  const maxFiles = Number.parseInt(
    process.env.NEXT_PUBLIC_RATELIMITER_LIMIT_FILES || '100',
  );
  if (filesCounts >= maxFiles) return false;

  const sizeLimitMB = Number.parseInt(
    process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT_MB || String(30),
  );
  const MB_TO_BYTES = (mb: number) => mb * 1024 * 1024;
  const SIZE_LIMIT = MB_TO_BYTES(sizeLimitMB);
  if (file.size > SIZE_LIMIT) {
    throw new Error(`File must be less than ${sizeLimitMB}MB`);
  }

  const { data: createdFile, error } = await supabase
    .from('files')
    .insert([fileRecord])
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const filePath = await uploadFile(file, {
    name: createdFile.name,
    user_id: createdFile.user_id,
    file_id: createdFile.name,
  });

  await updateFile(createdFile.id, {
    file_path: filePath,
  });

  try {
    await processFile(createdFile.id);
  } catch (error) {
    await deleteFile(createdFile.id);
    throw error;
  }

  const fetchedFile = await getFileById(createdFile.id);
  await getFileItemsByFileId(createdFile.id);

  return fetchedFile;
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

export const updateFile = async (
  fileId: string,
  file: TablesUpdate<'files'>,
) => {
  const { data: updatedFile, error } = await supabase
    .from('files')
    .update(file)
    .eq('id', fileId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updatedFile;
};

export const deleteFile = async (fileId: string) => {
  const { error } = await supabase.from('files').delete().eq('id', fileId);

  if (error) {
    throw new Error(error.message);
  }

  return true;
};

export const getFileItemsByFileIds = async (fileIds: string[]) => {
  if (!fileIds.length) return [];

  const returnData: Tables<'file_items'>[] = [];

  const { data, error } = await supabase
    .from('file_items')
    .select('*')
    .in(
      'file_id',
      fileIds.filter(
        (fileId) => !returnData.some((item) => item.file_id === fileId),
      ),
    );

  if (error) {
    throw new Error(error.message);
  }

  if (data?.length > 0) {
    returnData.push(...data);
  }

  return returnData;
};

export const getFileItemsByFileId = async (fileId: string) => {
  const { data, error } = await supabase
    .from('file_items')
    .select('*')
    .eq('file_id', fileId)
    .order('sequence_number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};
