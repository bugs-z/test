import type { BuiltChatMessage } from '@/types/chat-message';
import type { MessageContent } from '@/types/chat-message';
import type { TextPart, FilePart } from 'ai';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';

if (
  !process.env.NEXT_PUBLIC_CONVEX_URL ||
  !process.env.CONVEX_SERVICE_ROLE_KEY
) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL or CONVEX_SERVICE_ROLE_KEY environment variable is not defined',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

/**
 * Gets file content from Convex storage
 * @param fileId - The file ID to get content for
 * @param userId - User ID for authorization
 * @returns Buffer with file content or null if failed
 */
async function getFileContentFromStorage(
  fileId: Id<'files'>,
  userId: string,
): Promise<Buffer | null> {
  try {
    // Get the file metadata from Convex
    const fileMetadata = await convex.query(api.files.getFile, {
      fileId,
    });

    // Combined validation checks - return null if any condition fails
    if (
      !fileMetadata ||
      fileMetadata.user_id !== userId ||
      !fileMetadata.file_path ||
      fileMetadata.file_path === '' ||
      fileMetadata.file_path.includes('/')
    ) {
      return null;
    }

    // Handle Convex storage files only
    const fileUrl = await convex.query(
      api.fileStorage.getFileStorageUrlPublic,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        storageId: fileMetadata.file_path as Id<'_storage'>,
      },
    );

    if (!fileUrl) {
      return null;
    }

    // Fetch the file content from Convex storage URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error getting file content from storage:', error);
    return null;
  }
}

export function buildDocumentsText(fileItems: Doc<'file_items'>[]) {
  const fileGroups: Record<
    string,
    { id: string; name: string; content: string[] }
  > = fileItems.reduce(
    (
      acc: Record<string, { id: string; name: string; content: string[] }>,
      item: Doc<'file_items'>,
    ) => {
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
    {},
  );

  const documents = Object.values(fileGroups)
    .map((file: any) => {
      return `<document id="${file.id}">
<source>${file.name}</source>
<document_content>${file.content.join('\n\n')}</document_content>
</document>`;
    })
    .join('\n\n');

  return `<documents>\n${documents}\n</documents>`;
}

/**
 * Processes a PDF file item for chat messages
 * @param fileItem - The file item to process
 * @param userId - User ID for authorization
 * @returns File object for PDF or null if not a PDF
 */
export async function processPdfFileItem(
  fileItem: Doc<'file_items'>,
  userId: string,
) {
  try {
    // Check if file might be a PDF based on name
    if (!fileItem.name || !fileItem.name.toLowerCase().endsWith('.pdf')) {
      return null;
    }

    // Get the file metadata from Convex to check if it's a PDF
    const fileMetadata = await convex.query(api.files.getFile, {
      fileId: fileItem.file_id,
    });

    // Check if it's a PDF
    if (
      !fileMetadata ||
      (fileMetadata.type !== 'application/pdf' &&
        !fileMetadata.name.toLowerCase().endsWith('.pdf'))
    ) {
      return null;
    }

    // Get file content using the reusable function
    const buffer = await getFileContentFromStorage(fileItem.file_id, userId);

    if (!buffer) {
      return null;
    }

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
 * Creates an array of file objects with paths and content for pentest agent
 * @param localPath - The local path prefix for files
 * @param fileItems - Array of file items to process
 * @param userId - User ID for authorization
 * @returns Array of file objects with paths and raw buffer data
 */
export async function createPentestFileArray(
  localPath: string,
  fileItems: Doc<'file_items'>[],
  userId: string,
): Promise<Array<{ path: string; data: Buffer }>> {
  const pentestFiles: Array<{ path: string; data: Buffer }> = [];

  for (const fileItem of fileItems) {
    try {
      // Get file content from storage
      const buffer = await getFileContentFromStorage(fileItem.file_id, userId);

      if (buffer) {
        // Provide data as raw buffer
        pentestFiles.push({
          path: `${localPath}/${fileItem.name}`,
          data: buffer,
        });
      }
    } catch (error) {
      console.error(
        `Error processing file ${fileItem.name} for pentest:`,
        error,
      );
      // Continue with other files even if one fails
    }
  }

  return pentestFiles;
}

/**
 * Processes message content and attachments, handling different attachment types appropriately
 * @param messages - The chat messages to process
 * @param userId - The user ID for authorization
 * @returns The processed messages with attachments included and pentest files array if applicable
 */
export async function processMessageContentWithAttachments(
  messages: BuiltChatMessage[],
  userId: string,
  isReasoning: boolean,
  isPentestAgent = false,
): Promise<{
  processedMessages: BuiltChatMessage[];
  pentestFiles?: Array<{ path: string; data: Buffer }>;
  hasPdfAttachments?: boolean;
}> {
  if (!messages.length) return { processedMessages: messages };

  // Create a copy to avoid mutating the original
  let processedMessages = [...messages];
  let pentestFiles: Array<{ path: string; data: Buffer }> | undefined;
  let hasPdfAttachments = false;
  const localPath = '/mnt/data';

  try {
    // Collect all file IDs from user messages only
    const allFileIds = processedMessages
      .filter((m) => m.role === 'user') // Only process user messages
      .flatMap((m) => (m.attachments ?? []).map((a) => a.file_id))
      .filter(Boolean);

    // Make a single batch query for all file items
    const allFileItems = await convex.query(
      api.file_items.getAllFileItemsByFileIds,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        fileIds: allFileIds,
      },
    );

    // If this is a pentest agent, create the file array
    if (isPentestAgent && allFileItems) {
      pentestFiles = await createPentestFileArray(
        localPath,
        allFileItems,
        userId,
      );
    }

    // Process each message
    for (const message of processedMessages) {
      // Only process attachments for user messages
      if (
        message.role === 'user' &&
        message.attachments &&
        Array.isArray(message.attachments)
      ) {
        // Filter file items for this specific message
        const fileItems =
          allFileItems?.filter((fi) =>
            (message.attachments ?? []).some((a) => a.file_id === fi.file_id),
          ) ?? [];

        if (fileItems.length > 0) {
          // Process files in the order they appear in attachments
          const processedContent: MessageContent[] = [];

          // First add the original content if it's a string
          if (typeof message.content === 'string') {
            processedContent.push({
              type: 'text',
              text: message.content,
            } as TextPart);
          } else if (Array.isArray(message.content)) {
            processedContent.push(...message.content);
          }

          // Process each attachment in order
          for (const attachment of message.attachments) {
            if (!attachment.file_id) continue;

            const fileItem = fileItems.find(
              (item) => item.file_id === attachment.file_id,
            );
            if (!fileItem) continue;

            // If isReasoning is true, use buildDocumentsText for all files including PDFs
            if (isReasoning) {
              const documentsText = buildDocumentsText([fileItem]);
              processedContent.push({
                type: 'text',
                text: documentsText,
              } as TextPart);
            } else if (isPentestAgent) {
              // For pentest agent, add XML-like attachment reference (skip PDF processing)
              const attachmentRef = `<attachment filename="${fileItem.name}" local_path="${localPath}/${fileItem.name}" />`;
              processedContent.push({
                type: 'text',
                text: attachmentRef,
              } as TextPart);
            } else {
              // Check if it's a PDF for non-pentest agents
              const pdfFile = await processPdfFileItem(fileItem, userId);
              if (pdfFile) {
                // Always send PDFs as files
                processedContent.push(pdfFile as FilePart);
                hasPdfAttachments = true;
              } else if (!hasPdfAttachments) {
                // Normal case: add document text
                const documentsText = buildDocumentsText([fileItem]);
                processedContent.push({
                  type: 'text',
                  text: documentsText,
                } as TextPart);
              }
            }
          }

          // Update the message content with the processed content
          message.content = processedContent;
        }
      }
    }

    // Remove attachments from all messages after processing
    processedMessages = processedMessages.map(
      ({ attachments, ...messageWithoutAttachments }) =>
        messageWithoutAttachments,
    );

    return { processedMessages, pentestFiles, hasPdfAttachments };
  } catch (error) {
    console.error('Error processing message attachments:', error);
  }

  return { processedMessages };
}

/**
 * Removes PDF file content from message arrays
 * Filters out any objects that have type 'file' and mimeType 'application/pdf'
 */
export function removePdfContentFromMessages(messages: any[]) {
  return messages.map((message) => {
    // If content is an array, filter out PDF file objects
    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.filter(
          (item: any) =>
            !(item.type === 'file' && item.mimeType === 'application/pdf'),
        ),
      };
    }
    // Otherwise leave the message as is
    return message;
  });
}
