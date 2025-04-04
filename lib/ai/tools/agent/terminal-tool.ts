import { tool } from 'ai';
import { z } from 'zod';
import {
  type ToolContext,
  TEMPORARY_SANDBOX_TEMPLATE,
  PERSISTENT_SANDBOX_TEMPLATE,
  BASH_SANDBOX_TIMEOUT,
  PLUGIN_COMMAND_MAP,
} from './types';
import {
  createOrConnectTemporaryTerminal,
  createOrConnectPersistentTerminal,
} from '@/lib/tools/e2b/sandbox';
import { executeTerminalCommand } from '@/lib/tools/e2b/terminal-executor';
import {
  streamTerminalOutput,
  reduceTerminalOutput,
} from '@/lib/ai/terminal-utils';
import PostHogClient from '@/app/posthog';

/**
 * Creates a terminal tool for executing commands in the sandbox environment
 * @param context - The context needed for tool execution
 * @returns The terminal tool
 */
export const createTerminalTool = (context: ToolContext) => {
  const {
    dataStream,
    sandbox: initialSandbox,
    userID,
    persistentSandbox: initialPersistentSandbox = false,
    selectedPlugin,
    terminalTemplate = TEMPORARY_SANDBOX_TEMPLATE,
    setSandbox,
    setPersistentSandbox,
  } = context;

  let sandbox = initialSandbox;
  let persistentSandbox = initialPersistentSandbox;

  return tool({
    description: 'Execute commands in the sandbox environment.',
    parameters: z.object({
      command: z.string().describe('Command to execute'),
      /*...(selectedPlugin
        ? {}
        : {
            usePersistentSandbox: z
              .boolean()
              .optional()
              .describe(
                "Use persistent sandbox (30-day storage) instead of temporary"
              )
          })*/
    }),
    execute: async (args) => {
      const { command } = args;
      // Handle usePersistentSandbox with type safety
      const usePersistentSandbox = false;
      /* selectedPlugin
        ? false
        : Boolean(args.usePersistentSandbox) */

      // Validate plugin-specific commands
      if (selectedPlugin) {
        const expectedCommand = PLUGIN_COMMAND_MAP[selectedPlugin];
        if (expectedCommand && !command.trim().startsWith(expectedCommand)) {
          return `Command must start with "${expectedCommand}" for this plugin`;
        }
      }

      // Set sandbox type
      persistentSandbox = usePersistentSandbox;

      // Update the persistentSandbox value in the parent context if needed
      if (setPersistentSandbox) {
        setPersistentSandbox(persistentSandbox);
      }

      dataStream.writeData({
        type: 'sandbox-type',
        sandboxType: persistentSandbox
          ? 'persistent-sandbox'
          : 'temporary-sandbox',
      });

      // Create or connect to sandbox
      if (!sandbox) {
        sandbox = persistentSandbox
          ? await createOrConnectPersistentTerminal(
              userID,
              PERSISTENT_SANDBOX_TEMPLATE,
              BASH_SANDBOX_TIMEOUT,
            )
          : await createOrConnectTemporaryTerminal(
              userID,
              terminalTemplate,
              BASH_SANDBOX_TIMEOUT,
            );

        // Update the sandbox in the parent context if needed
        if (setSandbox) {
          setSandbox(sandbox);
        }
      }

      const posthog = PostHogClient();
      if (posthog) {
        posthog.capture({
          distinctId: userID,
          event: 'terminal_executed',
          properties: {
            command: command,
            persistentSandbox: persistentSandbox,
          },
        });
      }

      // Execute command
      const terminalStream = await executeTerminalCommand({
        userID,
        command,
        usePersistentSandbox: persistentSandbox,
        sandbox,
      });

      let terminalOutput = '';
      await streamTerminalOutput(terminalStream, (chunk) => {
        dataStream.writeData({
          type: 'text-delta',
          content: chunk,
        });
        terminalOutput += chunk;
      });

      return reduceTerminalOutput(terminalOutput);
    },
  });
};
