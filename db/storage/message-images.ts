import { supabase } from '@/lib/supabase/browser-client';

export const uploadMessageImage = async (path: string, image: File) => {
  const bucket = 'message_images';

  const imageSizeLimit = 6000000; // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`);
  }

  const { error } = await supabase.storage.from(bucket).upload(path, image, {
    upsert: true,
  });

  if (error) {
    throw new Error('Error uploading image');
  }

  return path;
};

export const uploadTemporaryImage = async (
  image: File,
  userId: string,
): Promise<string> => {
  // Create a temporary path for the image
  const tempId = crypto.randomUUID();
  const path = `${userId}/temp/${tempId}`;
  const bucket = 'message_images';

  // Upload image to storage
  const { error } = await supabase.storage.from(bucket).upload(path, image, {
    upsert: true,
  });

  if (error) {
    throw new Error('Error uploading temporary image');
  }

  return path;
};

export const getMessageImageFromStorage = async (filePath: string) => {
  const { data, error } = await supabase.storage
    .from('message_images')
    .createSignedUrl(filePath, 60 * 60 * 24); // 24hrs

  if (error) {
    throw new Error('Error downloading message image');
  }

  return data.signedUrl;
};

// Helper function to clean up temporary images
export const cleanupTemporaryImages = async (paths: string[]) => {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from('message_images').remove(paths);

  if (error) {
    console.error('Error cleaning up temporary images:', error);
  }
};
