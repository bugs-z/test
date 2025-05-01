import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';
import {
  handleFileError,
  ensureSandboxConnection,
} from './utils/sandbox-utils';

const replaceFileContent = async (
  sandbox: any,
  file: string,
  oldStr: string,
  newStr: string,
  dataStream: any,
): Promise<string> => {
  try {
    dataStream.writeData({
      type: 'agent-status',
      content: 'editing_file',
    });

    // Read existing content
    const existingContent = await sandbox.files.read(file);

    // Perform string replacement
    const finalContent = existingContent.replace(oldStr, newStr);

    // Write back to file
    await sandbox.files.write(file, finalContent);

    const wrappedContent = `<file-str-replace file="${file}">${finalContent}</file-str-replace>\n\n`;
    dataStream.writeData({
      type: 'text-delta',
      content: wrappedContent,
    });

    return `Successfully replaced content in file: ${file}`;
  } catch (error) {
    return handleFileError(error, 'replacing content in file');
  }
};

/**
 * Creates a tool for replacing strings in files
 * @param context - The context needed for tool execution
 * @returns The file string replacement tool
 */
export const createFileStrReplaceTool = (context: ToolContext) => {
  const {
    dataStream,
    sandbox: initialSandbox,
    userID,
    persistentSandbox: initialPersistentSandbox = true,
    setSandbox,
  } = context;

  return tool({
    description:
      'Replace specified string in a file. Use for updating specific content in files or fixing errors in code.',
    parameters: z.object({
      file: z
        .string()
        .describe('Absolute path of the file to perform replacement on'),
      old_str: z.string().describe('Original string to be replaced'),
      new_str: z.string().describe('New string to replace with'),
    }),
    execute: async (args) => {
      const { file, old_str, new_str } = args as {
        file: string;
        old_str: string;
        new_str: string;
      };

      try {
        // Ensure sandbox connection
        const { sandbox } = await ensureSandboxConnection(
          {
            userID,
            dataStream,
            setSandbox,
          },
          {
            initialSandbox,
            initialPersistentSandbox,
          },
        );

        return replaceFileContent(sandbox, file, old_str, new_str, dataStream);
      } catch (error) {
        return handleFileError(error, 'connecting to sandbox');
      }
    },
  });
};
