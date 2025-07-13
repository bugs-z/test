import type { BuiltChatMessage } from '@/types/chat-message';
import type { MessageContent } from '@/types/chat-message';
import type { TextPart, FilePart } from 'ai';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import {
  generatePentestFilesFromMessages,
  createAttachmentReferences,
} from './ai/pentest-files';

// Environment validation
if (
  !process.env.NEXT_PUBLIC_CONVEX_URL ||
  !process.env.CONVEX_SERVICE_ROLE_KEY
) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL or CONVEX_SERVICE_ROLE_KEY environment variable is not defined',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

// Constants
const LOCAL_PATH = '/home/user';

/**
 * Gets file content from Convex storage
 */
async function getFileContentFromStorage(
  fileId: Id<'files'>,
  userId: string,
): Promise<Buffer | null> {
  try {
    const fileMetadata = await convex.query(api.files.getFile, { fileId });

    // Validate file metadata
    if (
      !fileMetadata ||
      fileMetadata.user_id !== userId ||
      !fileMetadata.file_path ||
      fileMetadata.file_path === '' ||
      fileMetadata.file_path.includes('/')
    ) {
      return null;
    }

    // Get file URL from storage
    const fileUrl = await convex.query(
      api.fileStorage.getFileStorageUrlPublic,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        storageId: fileMetadata.file_path as Id<'_storage'>,
      },
    );

    if (!fileUrl) return null;

    // Fetch and return file content
    const response = await fetch(fileUrl);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error getting file content from storage:', error);
    return null;
  }
}

/**
 * Checks if a file is a PDF
 */
function isPdfFile(
  fileItem: Doc<'file_items'>,
  fileMetadata?: Doc<'files'>,
): boolean {
  const nameCheck = fileItem.name?.toLowerCase().endsWith('.pdf') ?? false;
  const typeCheck = fileMetadata?.type === 'application/pdf';
  const metadataNameCheck =
    fileMetadata?.name?.toLowerCase().endsWith('.pdf') ?? false;

  return nameCheck || typeCheck || metadataNameCheck;
}

/**
 * Builds documents text from file items
 */
export function buildDocumentsText(fileItems: Doc<'file_items'>[]): string {
  const fileGroups = fileItems.reduce(
    (acc, item) => {
      if (!acc[item.file_id]) {
        acc[item.file_id] = {
          id: item.file_id,
          name: item.name || 'unnamed file',
          content: [],
        };
      }
      acc[item.file_id].content.push(item.content);
      return acc;
    },
    {} as Record<string, { id: string; name: string; content: string[] }>,
  );

  const documents = Object.values(fileGroups)
    .map((file) => {
      const hasContent = file.content.some(
        (content) => content.trim().length > 0,
      );

      const documentContent = hasContent
        ? file.content.join('\n\n')
        : "File content is empty because it's a binary file or could not be processed into readable format. Use terminal commands to access the file content.";

      return `<document id="${file.id}">
<source>${file.name}</source>
<document_content>${documentContent}</document_content>
</document>`;
    })
    .join('\n\n');

  return `<documents>\n${documents}\n</documents>`;
}

/**
 * Processes a PDF file item for chat messages
 */
export async function processPdfFileItem(
  fileItem: Doc<'file_items'>,
  userId: string,
): Promise<FilePart | null> {
  try {
    // Quick check if file might be a PDF
    if (!isPdfFile(fileItem)) return null;

    // Get file metadata to confirm PDF type
    const fileMetadata = await convex.query(api.files.getFile, {
      fileId: fileItem.file_id,
    });

    if (!fileMetadata || !isPdfFile(fileItem, fileMetadata)) return null;

    // Get file content
    const buffer = await getFileContentFromStorage(fileItem.file_id, userId);
    if (!buffer) return null;

    return {
      type: 'file' as const,
      data: buffer,
      mimeType: 'application/pdf',
      filename: fileMetadata.name,
    };
  } catch (error) {
    console.error('Error processing PDF file item:', error);
    return null;
  }
}

/**
 * Processes file attachments based on mode
 */
async function processFileAttachments(
  attachments: any[],
  fileItems: Doc<'file_items'>[],
  userId: string,
  isReasoning: boolean,
  isTerminal: boolean,
): Promise<{ content: MessageContent[]; hasPdfAttachments: boolean }> {
  const processedContent: MessageContent[] = [];
  let hasPdfAttachments = false;

  for (const attachment of attachments) {
    if (!attachment.file_id) continue;

    const fileItem = fileItems.find(
      (item) => item.file_id === attachment.file_id,
    );
    if (!fileItem) continue;

    if (isReasoning) {
      // Use buildDocumentsText for all files including PDFs
      const documentsText = buildDocumentsText([fileItem]);
      processedContent.push({ type: 'text', text: documentsText } as TextPart);
    } else if (isTerminal) {
      // Add XML-like attachment reference for pentest agent
      const attachmentRef = createAttachmentReferences([fileItem], LOCAL_PATH);
      processedContent.push({ type: 'text', text: attachmentRef } as TextPart);
    } else {
      // Check if it's a PDF for non-pentest agents
      const pdfFile = await processPdfFileItem(fileItem, userId);
      if (pdfFile) {
        processedContent.push(pdfFile);
        hasPdfAttachments = true;
      } else {
        // Normal case: add document text
        const documentsText = buildDocumentsText([fileItem]);
        processedContent.push({
          type: 'text',
          text: documentsText,
        } as TextPart);
      }
    }
  }

  return { content: processedContent, hasPdfAttachments };
}

/**
 * Processes message content and attachments
 */
export async function processMessageContentWithAttachments(
  messages: BuiltChatMessage[],
  userId: string,
  isReasoning: boolean,
  isTerminal = false,
): Promise<{
  processedMessages: BuiltChatMessage[];
  pentestFiles?: Array<{ path: string; data: Buffer }>;
  hasPdfAttachments?: boolean;
}> {
  if (!messages.length) return { processedMessages: messages };

  const processedMessages = [...messages];
  let hasPdfAttachments = false;

  try {
    // Generate pentest files if this is a terminal request
    const pentestFiles = isTerminal
      ? await generatePentestFilesFromMessages(messages, userId, LOCAL_PATH)
      : undefined;

    // Collect all file IDs from user messages
    const allFileIds = processedMessages
      .filter((m) => m.role === 'user')
      .flatMap((m) => (m.attachments ?? []).map((a) => a.file_id))
      .filter(Boolean);

    // Get all file items in one batch
    const allFileItems =
      allFileIds.length > 0
        ? await convex.query(api.file_items.getAllFileItemsByFileIds, {
            serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
            fileIds: allFileIds,
          })
        : [];

    // Process each user message
    for (const message of processedMessages) {
      if (message.role !== 'user') continue;

      const processedContent: MessageContent[] = [];

      // Add original content
      if (typeof message.content === 'string') {
        processedContent.push({
          type: 'text',
          text: message.content,
        } as TextPart);
      } else if (Array.isArray(message.content)) {
        processedContent.push(...message.content);
      }

      // Process file attachments
      if (message.attachments?.length) {
        const messageFileItems =
          allFileItems?.filter((fi) =>
            message.attachments!.some((a) => a.file_id === fi.file_id),
          ) ?? [];

        const { content, hasPdfAttachments: hasMessagePdfs } =
          await processFileAttachments(
            message.attachments,
            messageFileItems,
            userId,
            isReasoning,
            isTerminal,
          );

        processedContent.push(...content);
        if (hasMessagePdfs) hasPdfAttachments = true;
      }

      // Update message content
      message.content = processedContent;
    }

    // Remove attachments from all messages after processing
    const finalMessages = processedMessages.map(
      ({ attachments, ...messageWithoutAttachments }) =>
        messageWithoutAttachments,
    );

    return {
      processedMessages: finalMessages,
      pentestFiles,
      hasPdfAttachments,
    };
  } catch (error) {
    console.error('Error processing message attachments:', error);
    return { processedMessages };
  }
}
