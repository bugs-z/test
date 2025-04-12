import { tool } from 'ai';
import { z } from 'zod';
import {
  type ToolContext,
  SANDBOX_TEMPLATE,
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
export const createShellExecTool = (context: ToolContext) => {
  const {
    dataStream,
    sandbox: initialSandbox,
    userID,
    persistentSandbox: initialPersistentSandbox = true,
    selectedPlugin,
    terminalTemplate = SANDBOX_TEMPLATE,
    setSandbox,
    setPersistentSandbox,
    isPremiumUser,
  } = context;

  let sandbox = initialSandbox;
  let persistentSandbox = initialPersistentSandbox;

  return tool({
    description:
      'Execute commands in the sandbox environment. Use for running code, installing packages, or managing files.',
    parameters: z.object({
      exec_dir: z
        .string()
        .describe(
          'Working directory for command execution (must use absolute path)',
        ),
      command: z.string().describe('Shell command to execute'),
      ...(selectedPlugin || !isPremiumUser
        ? {}
        : {
            useTemporarySandbox: z
              .boolean()
              .describe('Use temporary sandbox (15-minute timeout).'),
          }),
    }),
    execute: async (args) => {
      const { exec_dir, command, useTemporarySandbox } = args;

      // Validate plugin-specific commands
      if (selectedPlugin) {
        const expectedCommand = PLUGIN_COMMAND_MAP[selectedPlugin];
        if (expectedCommand && !command.trim().startsWith(expectedCommand)) {
          return `Command must start with "${expectedCommand}" for this plugin`;
        }
      }

      // Set sandbox type - force temporary sandbox for non-premium users
      if (!isPremiumUser) {
        persistentSandbox = false;
      } else if (selectedPlugin) {
        persistentSandbox = false; // Always use temporary sandbox for plugins
      } else {
        persistentSandbox = !useTemporarySandbox;
      }

      // Update persistent sandbox state in parent context
      if (setPersistentSandbox) {
        setPersistentSandbox(persistentSandbox);
      }

      // Create or connect to sandbox
      if (!sandbox) {
        sandbox = persistentSandbox
          ? await createOrConnectPersistentTerminal(
              userID,
              SANDBOX_TEMPLATE,
              BASH_SANDBOX_TIMEOUT,
              dataStream,
            )
          : await createOrConnectTemporaryTerminal(
              userID,
              terminalTemplate,
              BASH_SANDBOX_TIMEOUT,
              dataStream,
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
          event: selectedPlugin
            ? `${selectedPlugin}_executed`
            : 'terminal_executed',
          properties: {
            command: command,
            persistentSandbox: persistentSandbox,
          },
        });
      }

      dataStream.writeData({
        type: 'tool-call',
        content: 'terminal',
      });

      // Execute command
      const terminalStream = await executeTerminalCommand({
        userID,
        command,
        exec_dir,
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
