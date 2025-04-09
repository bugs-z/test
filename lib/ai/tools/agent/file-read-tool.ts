import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';
import {
  handleFileError,
  getSandboxTemplate,
  getSandboxTimeout,
  ensureSandboxConnection,
} from './utils/sandbox-utils';

const processFileContent = (
  content: string,
  start_line?: number,
  end_line?: number,
): string => {
  if (typeof start_line === 'number' || typeof end_line === 'number') {
    const lines = content.split('\n');
    const start = start_line ?? 0;
    const end = end_line ?? lines.length;
    return lines.slice(start, end).join('\n');
  }
  return content;
};

const readAndProcessFile = async (
  sandbox: any,
  dataStream: any,
  filePath: string,
  start_line?: number,
  end_line?: number,
): Promise<string> => {
  try {
    dataStream.writeData({
      type: 'tool-call',
      content: 'file_read',
    });

    const content = await sandbox.files.read(filePath);
    const processedContent = processFileContent(content, start_line, end_line);
    const wrappedContent = `<file-content path="${filePath}">${processedContent}</file-content>\n\n`;

    dataStream.writeData({
      type: 'text-delta',
      content: wrappedContent,
    });

    return processedContent;
  } catch (error) {
    return handleFileError(error, 'processing file');
  }
};

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
    terminalTemplate,
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
              .describe('Use temporary sandbox (15-minute timeout).'),
          }),
    }),
    execute: async ({ file, start_line, end_line, useTemporarySandbox }) => {
      try {
        // Ensure sandbox connection
        sandbox = await ensureSandboxConnection(
          sandbox,
          userID,
          getSandboxTemplate(terminalTemplate),
          getSandboxTimeout(),
          dataStream,
          setSandbox,
          persistentSandbox && !useTemporarySandbox,
        );

        return readAndProcessFile(
          sandbox,
          dataStream,
          file,
          start_line,
          end_line,
        );
      } catch (error) {
        return handleFileError(error, 'connecting to sandbox');
      }
    },
  });
};
