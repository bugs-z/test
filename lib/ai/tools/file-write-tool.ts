import { tool } from "ai"
import { z } from "zod"
import {
  ToolContext,
  TEMPORARY_SANDBOX_TEMPLATE,
  BASH_SANDBOX_TIMEOUT
} from "./types"
import { createOrConnectTemporaryTerminal } from "@/lib/tools/e2b/sandbox"
import { uploadFilesToSandbox } from "@/lib/tools/e2b/file-handler"

/**
 * Creates a tool for writing content to a file in the sandbox
 * @param context - The context needed for tool execution
 * @returns The file write tool
 */
export const createFileWriteTool = (context: ToolContext) => {
  const {
    dataStream,
    sandbox: initialSandbox,
    userID,
    terminalTemplate = TEMPORARY_SANDBOX_TEMPLATE,
    setSandbox
  } = context

  let sandbox = initialSandbox

  return tool({
    description: "Upload files to the sandbox.",
    parameters: z.object({
      files: z
        .array(
          z.object({
            fileId: z.string().describe("ID of the file to upload"),
            destination: z
              .string()
              .optional()
              .describe("Optional destination path in the sandbox")
          })
        )
        .max(3)
        .describe("Files to upload to sandbox (max 3 files)")
    }),
    execute: async ({ files }) => {
      // Create a temporary sandbox if one doesn't exist yet
      if (!sandbox) {
        try {
          // Use the provided terminalTemplate or fall back to the default
          const templateToUse = terminalTemplate || TEMPORARY_SANDBOX_TEMPLATE

          sandbox = await createOrConnectTemporaryTerminal(
            userID,
            templateToUse,
            BASH_SANDBOX_TIMEOUT
          )

          // Update the sandbox in the parent context if needed
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
        // Use the same uploadFilesToSandbox function that terminal uses
        const fileObjects = files.map(file => ({ fileId: file.fileId }))
        await uploadFilesToSandbox(fileObjects, sandbox, dataStream)

        // Create a summary of uploaded files
        const filesSummary = files
          .map((file, index) => {
            const destination = file.destination || "default location"
            return `${index + 1}. File ID: ${file.fileId} → ${destination}`
          })
          .join("\n")

        return `Successfully uploaded ${files.length} file(s) to the sandbox:\n${filesSummary}`
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        return `Error uploading files: ${errorMessage}`
      }
    }
  })
}
