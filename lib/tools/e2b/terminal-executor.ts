import type { Sandbox } from '@e2b/code-interpreter';

const MAX_EXECUTION_TIME = 10 * 60 * 1000;
const ENCODER = new TextEncoder();

interface ExecutionError {
  name: string;
  stderr?: string;
  value?: string;
  result?: {
    stderr?: string;
    stdout?: string;
    exitCode?: number;
  };
}

export const executeTerminalCommand = async ({
  userID,
  command,
  usePersistentSandbox = false,
  sandbox = null,
}: {
  userID: string;
  command: string;
  usePersistentSandbox?: boolean;
  sandbox?: Sandbox | null;
}): Promise<ReadableStream<Uint8Array>> => {
  let hasTerminalOutput = false;
  let currentBlock: 'stdout' | 'stderr' | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Reset state for new command
      hasTerminalOutput = false;
      if (currentBlock) {
        controller.enqueue(ENCODER.encode('\n```'));
        currentBlock = null;
      }

      controller.enqueue(
        ENCODER.encode(
          `<terminal-command sandbox-type="${usePersistentSandbox ? 'persistent' : 'temporary'}">${command}</terminal-command>`,
        ),
      );

      try {
        if (!sandbox) {
          throw new Error('Failed to create or connect to sandbox');
        }

        const execution = await sandbox.commands.run(command, {
          timeoutMs: MAX_EXECUTION_TIME,
          onStdout: (data: string) => {
            hasTerminalOutput = true;
            if (currentBlock !== 'stdout') {
              if (currentBlock) {
                controller.enqueue(ENCODER.encode('\n```'));
              }
              controller.enqueue(ENCODER.encode('\n```stdout\n'));
              currentBlock = 'stdout';
            }
            controller.enqueue(ENCODER.encode(data));
          },
          onStderr: (data: string) => {
            hasTerminalOutput = true;
            if (currentBlock !== 'stdout') {
              if (currentBlock) {
                controller.enqueue(ENCODER.encode('\n```'));
              }
              controller.enqueue(ENCODER.encode('\n```stdout\n'));
              currentBlock = 'stdout';
            }
            controller.enqueue(ENCODER.encode(data));
          },
        });

        // Close any open block at the end
        if (currentBlock) {
          controller.enqueue(ENCODER.encode('\n```'));
          currentBlock = null;
        }

        // Handle any execution errors
        if (execution.error) {
          console.error(`[${userID}] Execution error:`, execution.error);
          const error =
            typeof execution.error === 'object'
              ? (execution.error as ExecutionError)
              : { name: 'UnknownError' };
          const errorMessage = error.name.includes('TimeoutError')
            ? `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds. Try a shorter command or split it.`
            : error.result?.stderr ||
              error.stderr ||
              error.value ||
              'Unknown error';
          controller.enqueue(
            ENCODER.encode(`<terminal-error>${errorMessage}</terminal-error>`),
          );
        }
      } catch (error) {
        console.error(`[${userID}] Error:`, error);
        if (error instanceof Error && isConnectionError(error)) {
          sandbox?.kill();
          controller.enqueue(
            ENCODER.encode(
              `<terminal-error>The Terminal is currently unavailable. Our team is working on a fix. Please try again later.</terminal-error>`,
            ),
          );
        }
      } finally {
        // Ensure any open block is closed before ending the stream
        if (currentBlock) {
          controller.enqueue(ENCODER.encode('\n```'));
          currentBlock = null;
        }
        controller.close();
      }
    },
  });

  return stream;
};

function isConnectionError(error: Error): boolean {
  return (
    (error.name === 'TimeoutError' &&
      error.message.includes('Cannot connect to sandbox')) ||
    error.message.includes('503 Service Unavailable') ||
    error.message.includes('504 Gateway Timeout') ||
    error.message.includes('502 Bad Gateway')
  );
}

class CustomExecutionError extends Error {
  value: string;
  traceback: string;

  constructor(name: string, value: string, traceback: string) {
    super(name);
    this.name = name;
    this.value = value;
    this.traceback = traceback;
  }
}
