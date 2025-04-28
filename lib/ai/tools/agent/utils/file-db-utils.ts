import type { FileAttachment } from '@/types';
import { createAdminFile } from '@/db/storage/admin-files';

export const saveFileToDatabase = async (
  filePath: string,
  content: string,
  userId: string,
  dataStream: any,
  append?: boolean,
): Promise<FileAttachment | null> => {
  // Extract filename from path
  const fileName = filePath.split('/').pop() || 'untitled.txt';

  // Create a File object from the content
  const file = new File([content], fileName, { type: 'text/plain' });

  // Create file record
  const fileRecord = {
    name: fileName,
    user_id: userId,
    file_path: '',
    size: content.length,
    tokens: 0,
    type: 'text/plain',
  };

  try {
    // Use createAdminFile to handle the file upload and processing
    const createdFile = await createAdminFile(file, fileRecord, append);

    if (!createdFile) {
      console.error('Failed to create file');
      return null;
    }

    const fileData: FileAttachment = {
      fileName: createdFile.name,
      id: createdFile.id,
      mimeType: createdFile.type,
      type: 'text',
      url: createdFile.file_path,
    };

    // Send file metadata as a separate attachment
    if (!append) {
      dataStream.writeData({
        type: 'file-attachment',
        content: [fileData],
      });
    }

    return fileData;
  } catch (error) {
    console.error('Error creating file:', error);
    return null;
  }
};
