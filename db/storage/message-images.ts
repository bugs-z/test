import { supabase } from '@/lib/supabase/browser-client';
import { v4 as uuidv4 } from 'uuid';

export const uploadImage = async (
  image: File,
  userId: string,
): Promise<string> => {
  const imageSizeLimit = 5000000; // 5MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`);
  }

  // Create a path for the image
  const path = `${userId}/image-${uuidv4()}`;
  const bucket = 'message_images';

  // Upload image to storage
  const { error } = await supabase.storage.from(bucket).upload(path, image, {
    upsert: true,
  });

  if (error) {
    throw new Error('Error uploading image');
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
