import type { SupabaseClient } from '@supabase/supabase-js';

export const uploadFileToStorage = async (
  file: File,
  payload: {
    name: string;
    user_id: string;
    file_id: string;
  },
  supabase: SupabaseClient,
) => {
  const filePath = `${payload.user_id}/${Buffer.from(payload.file_id).toString('base64')}`;

  try {
    const { error } = await supabase.storage
      .from('files')
      .upload(filePath, file, {
        upsert: true,
      });

    if (error) {
      throw new Error(`Error uploading file: ${error.message}`);
    }

    return filePath;
  } catch (error) {
    console.error('Unexpected error during file upload:', error);
    throw error;
  }
};

export const cleanupFileFromStorage = async (
  filePath: string,
  fileId: string,
  supabase: SupabaseClient,
) => {
  try {
    // Delete from database
    await supabase.from('files').delete().eq('id', fileId);

    // Delete from Supabase storage
    await supabase.storage.from('files').remove([filePath]);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};
