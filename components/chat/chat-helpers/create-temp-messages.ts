import type { Id } from '@/convex/_generated/dataModel';
import { CONTINUE_PROMPT } from '@/lib/models/llm-prompting';
import { lastSequenceNumber } from '@/lib/utils';
import type { ChatMessage, LLMID, MessageImage } from '@/types';
import type { PluginID } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export const createTempMessages = ({
  messageContent,
  chatMessages,
  newMessageImages,
  setChatImages,
  isContinuation,
  selectedPlugin,
  model,
}: {
  messageContent: string | null;
  chatMessages: ChatMessage[];
  newMessageImages: MessageImage[];
  setChatImages: React.Dispatch<React.SetStateAction<MessageImage[]>>;
  isContinuation: boolean;
  selectedPlugin: PluginID | null;
  model: LLMID;
}) => {
  const messageContentInternal = isContinuation
    ? CONTINUE_PROMPT
    : messageContent || CONTINUE_PROMPT;

  const tempUserMessageId = uuidv4();

  // Add images to chat state immediately with the temp message ID
  // Remove base64 data since we no longer need it (use URLs for display)
  if (newMessageImages.length > 0) {
    const imagesWithMessageId = newMessageImages.map((image) => ({
      ...image,
      messageId: tempUserMessageId,
      base64: undefined, // Clear base64 to free memory
    }));

    setChatImages((prevImages) => [...prevImages, ...imagesWithMessageId]);
  }

  // Use image paths instead of base64 data for better performance
  const imagePaths = newMessageImages.map((image) => image.path);

  const tempUserChatMessage: ChatMessage = {
    message: {
      _id: uuidv4() as Id<'messages'>,
      _creationTime: Date.now(),
      chat_id: '',
      content: messageContentInternal,
      thinking_content: undefined,
      thinking_elapsed_secs: undefined,
      model,
      plugin: selectedPlugin || undefined,
      role: 'user',
      sequence_number: lastSequenceNumber(chatMessages) + 1,
      updated_at: Date.now(),
      id: tempUserMessageId,
      image_paths: imagePaths,
      user_id: '',
      citations: [],
      attachments: [],
    },
    fileItems: [],
  };

  const tempAssistantChatMessage: ChatMessage = {
    message: {
      _id: uuidv4() as Id<'messages'>,
      _creationTime: Date.now(),
      chat_id: '',
      content: '',
      thinking_content: undefined,
      thinking_elapsed_secs: undefined,
      model,
      plugin: selectedPlugin || undefined,
      role: 'assistant',
      sequence_number: lastSequenceNumber(chatMessages) + 2,
      updated_at: Date.now(),
      id: uuidv4(),
      image_paths: [],
      user_id: '',
      citations: [],
      attachments: [],
    },
    fileItems: [],
  };

  return {
    tempUserChatMessage,
    tempAssistantChatMessage,
  };
};
