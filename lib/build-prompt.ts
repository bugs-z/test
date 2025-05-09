import type {
  BuiltChatMessage,
  ChatMessage,
  ChatPayload,
  MessageImage,
  LLMID,
} from '@/types';
import { countTokens } from 'gpt-tokenizer';
import { SmallModel, LargeModel } from './models/hackerai-llm-list';
import { toast } from 'sonner';

// Helper function to find the last user message
function findLastUserMessage(
  chatMessages: ChatMessage[],
): ChatMessage | undefined {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].message.role === 'user') {
      return chatMessages[i];
    }
  }
  return undefined;
}

export async function buildFinalMessages(
  payload: ChatPayload,
  model: LLMID,
  chatImages: MessageImage[],
): Promise<BuiltChatMessage[]> {
  const { chatMessages, retrievedFileItems } = payload;

  let CHUNK_SIZE = 12000;
  if (model === LargeModel.modelId) {
    CHUNK_SIZE = 24000 - 4000; // -4000 for the system prompt, custom instructions, and more
  } else if (model === SmallModel.modelId) {
    CHUNK_SIZE = 12000 - 4000; // -4000 for the system prompt, custom instructions, and more
  }

  let remainingTokens = CHUNK_SIZE;

  // Find the last user message
  const lastUserMessage = findLastUserMessage(chatMessages);
  if (!lastUserMessage) {
    throw new Error('No user message found in chat');
  }

  const lastUserMessageContent = Array.isArray(lastUserMessage.message.content)
    ? lastUserMessage.message.content
        .map((item) => (item.type === 'text' ? item.text : ''))
        .join(' ')
    : lastUserMessage.message.content;
  const lastUserMessageTokens = countTokens(lastUserMessageContent);

  if (lastUserMessageTokens > CHUNK_SIZE) {
    const errorMessage =
      'The message you submitted was too long, please submit something shorter.';
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }

  const truncatedMessages: any[] = [];

  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const message = chatMessages[i].message;
    const fileItems = chatMessages[i].fileItems;
    const isLastUserMessage = chatMessages[i] === lastUserMessage;

    let messageTokens = countTokens(message.content);

    // Add tokens from file items if they exist
    if (fileItems && fileItems.length > 0) {
      messageTokens += fileItems.reduce(
        (acc, item) => acc + (item.tokens || 0),
        0,
      );
    }

    // Add tokens from retrieved file items for the last user message
    if (
      isLastUserMessage &&
      retrievedFileItems &&
      retrievedFileItems.length > 0
    ) {
      messageTokens += retrievedFileItems.reduce(
        (acc, item) => acc + (item.tokens || 0),
        0,
      );
    }

    if (messageTokens <= remainingTokens) {
      remainingTokens -= messageTokens;
      truncatedMessages.unshift({
        ...message,
        // Consolidate and deduplicate attachments from both sources
        ...(() => {
          const baseAttachments = (fileItems ?? []).map((fi) => ({
            file_id: fi.file_id,
          }));
          const retrievedAttachments =
            isLastUserMessage && retrievedFileItems
              ? retrievedFileItems.map((ri) => ({ file_id: ri.file_id }))
              : [];

          const uniqueAttachments = Array.from(
            new Map(
              [...baseAttachments, ...retrievedAttachments].map((obj) => [
                obj.file_id,
                obj,
              ]),
            ).values(),
          );

          return uniqueAttachments.length
            ? { attachments: uniqueAttachments }
            : {};
        })(),
      });
    } else {
      break;
    }
  }

  const finalMessages: BuiltChatMessage[] = truncatedMessages.map((message) => {
    let content;

    if (
      message.image_paths &&
      message.image_paths.length > 0 &&
      message.role !== 'assistant'
    ) {
      content = [
        {
          type: 'text',
          text: message.content,
        },
        ...message.image_paths
          .map((path: string) => {
            const isBase64 = path.startsWith('data');
            return {
              type: 'image_url' as const,
              image_url: {
                url: path,
                isPath: !isBase64,
              },
            };
          })
          .filter(Boolean), // Remove any null entries
      ];
    } else {
      content = message.content;
    }

    return {
      role: message.role,
      content,
      ...(message.attachments ? { attachments: message.attachments } : {}),
    };
  });

  return finalMessages;
}
