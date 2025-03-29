import { ToolContext } from "./types"
import { createTerminalTool } from "./terminal-tool"
import { createMessageNotifyTool } from "./message-notify-tool"
import { createMessageAskTool } from "./message-ask-tool"
import { createFileWriteTool } from "./file-write-tool"
import { createFileReadTool } from "./file-read-tool"
import { createIdleTool } from "./idle-tool"
import { createFileUploadTool } from "./file-upload-tool"

/**
 * Creates and returns all agent tools with the provided context
 * @param context - The context needed for tool execution
 * @returns Object containing all available agent tools
 */
export function createAgentTools(context: ToolContext) {
  return {
    terminal: createTerminalTool(context),
    message_notify_user: createMessageNotifyTool(context),
    message_ask_user: createMessageAskTool(),
    file_write: createFileWriteTool(context),
    file_upload: createFileUploadTool(context),
    file_read: createFileReadTool(context),
    idle: createIdleTool()
  }
}

// Export types and constants
export * from "./types"
