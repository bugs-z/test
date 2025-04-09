import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';
import {
  handleFileError,
  getSandboxTemplate,
  getSandboxTimeout,
  ensureSandboxConnection,
} from './utils/sandbox-utils';

const writeFileContent = async (
  sandbox: any,
  file: string,
  content: string,
  append: boolean,
  leading_newline: boolean,
  trailing_newline: boolean,
  dataStream: any,
): Promise<string> => {
  try {
    dataStream.writeData({
      type: 'tool-call',
      content: 'file_write',
    });

    let finalContent = content;

    if (leading_newline) {
      finalContent = `\n${finalContent}`;
    }
    if (trailing_newline) {
      finalContent = `${finalContent}\n`;
    }

    if (append) {
      try {
        const existingContent = await sandbox.files.read(file);
        finalContent = existingContent + finalContent;
      } catch {
        // File doesn't exist yet, continue with just the new content
      }
    }

    await sandbox.files.write(file, finalContent);

    const wrappedContent = `<file-write file="${file}">${finalContent}</file-write>\n\n`;
    dataStream.writeData({
      type: 'text-delta',
      content: wrappedContent,
    });

    return `Successfully ${append ? 'appended to' : 'wrote'} file: ${file}`;
  } catch (error) {
    return handleFileError(error, 'writing to file');
  }
};

/**
 * Creates a tool for writing content to files
 * @param context - The context needed for tool execution
 * @returns The file write tool
 */
export const createFileWriteTool = (context: ToolContext) => {
  const {
    sandbox: initialSandbox,
    userID,
    terminalTemplate,
    setSandbox,
    persistentSandbox,
    dataStream,
  } = context;

  let sandbox = initialSandbox;

  return tool({
    description:
      'Overwrite or append content to a file. Use for creating new files, appending content, or modifying existing files.',
    parameters: z.object({
      file: z.string().describe('Absolute path of the file to write to'),
      content: z.string().describe('Text content to write'),
      append: z.boolean().optional().describe('Whether to use append mode'),
      leading_newline: z
        .boolean()
        .optional()
        .describe('Whether to add a leading newline'),
      trailing_newline: z
        .boolean()
        .optional()
        .describe('Whether to add a trailing newline'),
      ...(sandbox
        ? {}
        : {
            useTemporarySandbox: z
              .boolean()
              .describe('Use temporary sandbox (15-minute timeout).'),
          }),
    }),
    execute: async ({
      file,
      content,
      append,
      leading_newline,
      trailing_newline,
      useTemporarySandbox,
    }) => {
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

        return writeFileContent(
          sandbox,
          file,
          content,
          append ?? false,
          leading_newline ?? false,
          trailing_newline ?? false,
          dataStream,
        );
      } catch (error) {
        return handleFileError(error, 'connecting to sandbox');
      }
    },
  });
};
