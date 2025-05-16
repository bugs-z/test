import { supabase } from '@/lib/supabase/browser-client';
import type { TablesInsert, TablesUpdate } from '@/supabase/types';
import mammoth from 'mammoth';

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

    // Create a new file with the processed text content
    const processedFile = new File([result.value], fileRecord.name, {
      type: 'text/plain',
    });

    return createFile(processedFile, fileRecord);
  } else {
    return createFile(file, fileRecord);
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

  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileRecord', JSON.stringify(fileRecord));

  const response = await fetch('/api/files', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const jsonText = await response.text();
    const json = JSON.parse(jsonText);
    console.error(
      `Error processing file, status:${response.status}, response:${json.message}`,
    );
    throw new Error(
      `Failed to process file (${fileRecord.name}): ${json.message}`,
    );
  }

  const { createdFile } = await response.json();

  if (!createdFile) {
    throw new Error('Failed to create file: No file ID returned');
  }

  const fetchedFile = await getFileById(createdFile.id);

  return fetchedFile;
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

export const getFileItemsByFileId = async (
  fileId: string,
  useStored = true,
) => {
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
