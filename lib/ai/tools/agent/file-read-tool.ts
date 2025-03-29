import { tool } from "ai"
import { z } from "zod"
import {
  ToolContext,
  TEMPORARY_SANDBOX_TEMPLATE,
  BASH_SANDBOX_TIMEOUT
} from "./types"
import { createOrConnectTemporaryTerminal } from "@/lib/tools/e2b/sandbox"

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
    terminalTemplate = TEMPORARY_SANDBOX_TEMPLATE,
    setSandbox
  } = context

  let sandbox = initialSandbox

  return tool({
    description:
      "Read file content from the sandbox. Use for checking file contents, analyzing logs, or reading configuration files.",
    parameters: z.object({
      file: z.string().describe("Absolute path of the file to read"),
      start_line: z
        .number()
        .optional()
        .describe("(Optional) Starting line to read from, 0-based"),
      end_line: z
        .number()
        .optional()
        .describe("(Optional) Ending line number (exclusive)")
    }),
    execute: async ({ file, start_line, end_line }) => {
      if (!sandbox) {
        try {
          const templateToUse = terminalTemplate || TEMPORARY_SANDBOX_TEMPLATE

          sandbox = await createOrConnectTemporaryTerminal(
            userID,
            templateToUse,
            BASH_SANDBOX_TIMEOUT
          )

          if (setSandbox) {
            setSandbox(sandbox)
          }

          dataStream.writeData({
            type: "sandbox-type",
            sandboxType: "temporary-sandbox"
          })
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          return `Failed to create sandbox: ${errorMessage}`
        }
      }

      if (!sandbox) {
        return "Error: Unable to create or access a sandbox environment. Please try using the terminal tool first."
      }

      try {
        let content = await sandbox.files.read(file)

        if (typeof start_line === "number" || typeof end_line === "number") {
          const lines = content.split("\n")
          const start = start_line || 0
          const end = end_line || lines.length
          content = lines.slice(start, end).join("\n")
        }

        return content
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        return `Error processing file: ${errorMessage}`
      }
    }
  })
}
