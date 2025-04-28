import { createSupabaseAdminClient } from '@/lib/server/server-utils';
import type { TablesInsert } from '@/supabase/types';

const uploadAdminFile = async (
  file: File,
  payload: {
    name: string;
    user_id: string;
    file_id: string;
    supabaseAdmin: any;
  },
) => {
  const sizeLimitMB = Number.parseInt(
    process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT_MB || String(30),
  );
  const MB_TO_BYTES = (mb: number) => mb * 1024 * 1024;
  const SIZE_LIMIT = MB_TO_BYTES(sizeLimitMB);

  if (file.size > SIZE_LIMIT) {
    throw new Error(`File must be less than ${sizeLimitMB}MB`);
  }

  const filePath = `${payload.user_id}/${Buffer.from(payload.file_id).toString('base64')}`;

  const { error } = await payload.supabaseAdmin.storage
    .from('files')
    .upload(filePath, file, {
      upsert: true,
    });

  if (error) {
    throw new Error(`Error uploading file: ${error.message}`);
  }

  return filePath;
};

export const createAdminFile = async (
  file: File,
  fileRecord: TablesInsert<'files'>,
  append?: boolean,
) => {
  const supabaseAdmin = createSupabaseAdminClient();

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
    const { data: existingFile, error: findError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('user_id', fileRecord.user_id)
      .eq('name', validFilename)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned"
      throw new Error(findError.message);
    }

    if (existingFile) {
      // Update the existing file
      const { data: updatedFile, error: updateError } = await supabaseAdmin
        .from('files')
        .update({
          size: file.size,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingFile.id)
        .select('*')
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      createdFile = updatedFile;
    }
  }

  // If no existing file was found or append is false, create a new file
  if (!createdFile) {
    const { data: newFile, error: insertError } = await supabaseAdmin
      .from('files')
      .insert([fileRecord])
      .select('*')
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    createdFile = newFile;
  }

  // Upload file to storage using admin client
  const filePath = await uploadAdminFile(file, {
    name: createdFile.name,
    user_id: createdFile.user_id,
    file_id: createdFile.id,
    supabaseAdmin,
  });

  // Update file path
  await supabaseAdmin
    .from('files')
    .update({ file_path: filePath })
    .eq('id', createdFile.id);

  // Get the final file record
  const { data: finalFile, error: finalError } = await supabaseAdmin
    .from('files')
    .select('*')
    .eq('id', createdFile.id)
    .single();

  if (finalError) {
    throw new Error(finalError.message);
  }

  return finalFile;
};
