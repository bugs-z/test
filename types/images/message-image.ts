export interface MessageImage {
  messageId: string;
  path: string;
  base64?: string; // Only used for loading preview during upload
  url: string;
  file: File | null;
  isLoading?: boolean;
  hasError?: boolean;
}
