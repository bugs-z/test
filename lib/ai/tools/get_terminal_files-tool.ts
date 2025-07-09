import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './agent/types';
import { handleMessageAttachments } from './agent/utils/file-db-utils';

/**
 * Creates a tool for providing terminal files as attachments to the user
 * @param context - The context needed for tool execution
 * @returns The terminal files attachment tool
 */
export const createGetTerminalFilesTool = (context: ToolContext) => {
  const { dataStream, userID, sandboxManager } = context;

  return tool({
    description: `Provide terminal files as attachments to the user. Use this when you need to share files created, modified, or accessed during terminal operations.`,
    parameters: z.object({
      files: z
        .array(z.string())
        .describe('Array of file paths to provide as attachments to the user'),
    }),
    execute: async ({ files }) => {
      // Handle file attachments
      if (files && files.length > 0) {
        if (!sandboxManager) {
          throw new Error('Sandbox manager not initialized');
        }

        const result = await handleMessageAttachments({
          attachments: files,
          userID,
          dataStream,
          sandboxManager,
        });

        if (result.errors) {
          return {
            success: false,
            error: result.errors.join('\n'),
            files: result.files,
          };
        }

        return {
          success: true,
          files: result.files,
        };
      }

      return {
        success: false,
        error: 'No files provided',
      };
    },
  });
};
