import type { ToolContext } from './types';
import { createShellExecTool } from './shell-exec-tool';
import { createMessageNotifyTool } from './message-notify-tool';
import { createMessageAskTool } from './message-ask-tool';
// import { createFileWriteTool } from './file-write-tool';
// import { createFileReadTool } from './file-read-tool';
import { createIdleTool } from './idle-tool';
import { createShellWaitTool } from './shell-wait-tool';

/**
 * Creates and returns all agent tools with the provided context
 * @param context - The context needed for tool execution
 * @returns Object containing all available agent tools
 */
export function createAgentTools(context: ToolContext) {
  return {
    shell_exec: createShellExecTool(context),
    shell_wait: createShellWaitTool(context),
    message_notify_user: createMessageNotifyTool(context),
    message_ask_user: createMessageAskTool(),
    // TODO: File operations are currently disabled due to sandbox state management issues.
    // The shell-exec tool creates a sandbox, but file operations create their own instances.
    // We need to implement proper sandbox state sharing between tools to enable file operations.
    // file_write: createFileWriteTool(context),
    // file_read: createFileReadTool(context),
    idle: createIdleTool(),
  };
}

// Export types and constants
export * from './types';
