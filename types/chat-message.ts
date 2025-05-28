import type { Tables } from '@/supabase/types';
import type { FilePart, TextPart } from 'ai';
import type { PluginID } from './plugins';
import type { Feedback } from './feedback';

export interface ChatMessage {
  message: Tables<'messages'>;
  fileItems: Tables<'file_items'>[];
  feedback?: Feedback;
  attachments?: Tables<'file_items'>[];
}

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export type MessageContent = ImageContent | TextPart | FilePart;

export interface BuiltChatMessage {
  role: string;
  content: string | MessageContent[];
  attachments?: Tables<'file_items'>[];
}

export interface ProviderMetadata {
  thinking_enabled?: boolean;
  thinking_elapsed_secs?: number | null;
  citations?: string[];
}

export interface MessageModelParams {
  plugin: PluginID;
}
