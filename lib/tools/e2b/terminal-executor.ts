import type { Sandbox } from '@e2b/code-interpreter';

const MAX_EXECUTION_TIME = 5 * 60 * 1000;
const CUSTOM_TIMEOUT = 1 * 60 * 1000; // 1 minute custom timeout
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
  exec_dir,
  usePersistentSandbox = false,
  sandbox = null,
}: {
  userID: string;
  command: string;
  exec_dir: string;
  usePersistentSandbox?: boolean;
  sandbox?: Sandbox | null;
}): Promise<ReadableStream<Uint8Array>> => {
  let hasTerminalOutput = false;
  let currentBlock: 'stdout' | null = null;
  let timeoutId: NodeJS.Timeout;
  let isStreamClosed = false;

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
          `<terminal-command sandbox-type="${usePersistentSandbox ? 'persistent' : 'temporary'}" exec-dir="${exec_dir}">${command}</terminal-command>`,
        ),
      );

      try {
        if (!sandbox) {
          throw new Error('Failed to create or connect to sandbox');
        }

        // Set up custom timeout
        timeoutId = setTimeout(() => {
          if (!isStreamClosed) {
            // Close any open block before sending timeout message
            if (currentBlock) {
              controller.enqueue(ENCODER.encode('\n```'));
              currentBlock = null;
            }
            controller.enqueue(
              ENCODER.encode(
                `<terminal-error>The command's output stream has been paused after ${CUSTOM_TIMEOUT / 1000} seconds. The command may continue running in the background, but its output will no longer be streamed.</terminal-error>`,
              ),
            );
            controller.close();
            isStreamClosed = true;
          }
        }, CUSTOM_TIMEOUT);

        const execution = await sandbox.commands.run(command, {
          timeoutMs: MAX_EXECUTION_TIME,
          cwd: exec_dir,
          onStdout: (data: string) => {
            if (isStreamClosed) return;
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
            if (isStreamClosed) return;
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

        // Clear the timeout if command completes before timeout
        clearTimeout(timeoutId);

        // Close any open block at the end
        if (currentBlock && !isStreamClosed) {
          controller.enqueue(ENCODER.encode('\n```'));
          currentBlock = null;
        }

        // Handle any execution errors
        if (execution.error && !isStreamClosed) {
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
        if (!isStreamClosed) {
          console.error(`[${userID}] Error:`, error);
          if (error instanceof Error && isConnectionError(error)) {
            // Close any open block before sending error message
            if (currentBlock) {
              controller.enqueue(ENCODER.encode('\n```'));
              currentBlock = null;
            }
            controller.enqueue(
              ENCODER.encode(
                `<terminal-error>The Terminal is currently unavailable. Our team is working on a fix. Please try again later.</terminal-error>`,
              ),
            );
          }
        }
      } finally {
        // Clear timeout in case it's still pending
        clearTimeout(timeoutId);
        // Ensure any open block is closed before ending the stream
        if (currentBlock && !isStreamClosed) {
          controller.enqueue(ENCODER.encode('\n```'));
          currentBlock = null;
        }
        if (!isStreamClosed) {
          controller.close();
        }
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
