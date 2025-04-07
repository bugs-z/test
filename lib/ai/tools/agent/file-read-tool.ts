import { tool } from 'ai';
import { z } from 'zod';
import {
  type ToolContext,
  SANDBOX_TEMPLATE,
  BASH_SANDBOX_TIMEOUT,
} from './types';
import { createOrConnectTemporaryTerminal } from '@/lib/tools/e2b/sandbox';

/**
 * Creates a tool for reading content from a file in the sandbox
 * @param context - The context needed for tool execution
 * @returns The file read tool
 */
export const createFileReadTool = (context: ToolContext) => {
  const {
    dataStream,
    sandbox: initialSandbox,
    userID,
    terminalTemplate = SANDBOX_TEMPLATE,
    setSandbox,
    persistentSandbox,
  } = context;

  let sandbox = initialSandbox;

  return tool({
    description:
      'Read file content from the sandbox. Use for checking file contents, analyzing logs, or reading configuration files.',
    parameters: z.object({
      file: z.string().describe('Absolute path of the file to read'),
      start_line: z
        .number()
        .optional()
        .describe('(Optional) Starting line to read from, 0-based'),
      end_line: z
        .number()
        .optional()
        .describe('(Optional) Ending line number (exclusive)'),
      ...(sandbox
        ? {}
        : {
            useTemporarySandbox: z
              .boolean()
              .describe(
                'Use temporary sandbox (15-minute timeout). Required when no sandbox is initialized.',
              ),
          }),
    }),
    execute: async ({ file, start_line, end_line, useTemporarySandbox }) => {
      // If we have a persistent sandbox, use it
      if (persistentSandbox && sandbox) {
        try {
          dataStream.writeData({
            type: 'tool-call',
            content: 'file_read',
          });

          let content = await sandbox.files.read(file);

          if (typeof start_line === 'number' || typeof end_line === 'number') {
            const lines = content.split('\n');
            const start = start_line || 0;
            const end = end_line || lines.length;
            content = lines.slice(start, end).join('\n');
          }

          const wrappedContent = `<file-content path="${file}">${content}</file-content>`;
          dataStream.writeData({
            type: 'text-delta',
            content: wrappedContent,
          });

          return content;
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return `Error reading file from persistent sandbox: ${errorMessage}`;
        }
      }

      // If no sandbox exists and temporary sandbox is requested
      if (!sandbox && useTemporarySandbox) {
        try {
          const templateToUse = terminalTemplate || SANDBOX_TEMPLATE;

          sandbox = await createOrConnectTemporaryTerminal(
            userID,
            templateToUse,
            BASH_SANDBOX_TIMEOUT,
            dataStream,
          );

          if (setSandbox) {
            setSandbox(sandbox);
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return `Failed to create temporary sandbox: ${errorMessage}`;
        }
      }

      if (!sandbox) {
        return 'Error: No sandbox environment available. Please initialize a sandbox first using the terminal tool or set useTemporarySandbox=true to create a temporary one.';
      }

      try {
        dataStream.writeData({
          type: 'tool-call',
          content: 'file_read',
        });

        let content = await sandbox.files.read(file);

        if (typeof start_line === 'number' || typeof end_line === 'number') {
          const lines = content.split('\n');
          const start = start_line || 0;
          const end = end_line || lines.length;
          content = lines.slice(start, end).join('\n');
        }

        const wrappedContent = `<file-content path="${file}">${content}</file-content>`;
        dataStream.writeData({
          type: 'text-delta',
          content: wrappedContent,
        });

        return content;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `Error processing file: ${errorMessage}`;
      }
    },
  });
};
