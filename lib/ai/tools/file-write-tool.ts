import { tool } from "ai"
import { z } from "zod"
import { ToolContext } from "./types"

/**
 * Creates a tool for writing content to files
 * @param context - The context needed for tool execution
 * @returns The file write tool
 */
export const createFileWriteTool = (context: ToolContext) => {
  const { sandbox } = context

  return tool({
    description:
      "Overwrite or append content to a file. Use for creating new files, appending content, or modifying existing files.",
    parameters: z.object({
      file: z.string().describe("Absolute path of the file to write to"),
      content: z.string().describe("Text content to write"),
      append: z.boolean().optional().describe("Whether to use append mode"),
      leading_newline: z
        .boolean()
        .optional()
        .describe("Whether to add a leading newline"),
      trailing_newline: z
        .boolean()
        .optional()
        .describe("Whether to add a trailing newline")
    }),
    execute: async ({
      file,
      content,
      append,
      leading_newline,
      trailing_newline
    }) => {
      if (!sandbox) {
        return "Error: No sandbox environment available. Please try using the terminal tool first."
      }

      try {
        let finalContent = content

        if (leading_newline) {
          finalContent = "\n" + finalContent
        }
        if (trailing_newline) {
          finalContent = finalContent + "\n"
        }

        if (append) {
          // For append mode, first read existing content if file exists
          try {
            const existingContent = await sandbox.files.read(file)
            finalContent = existingContent + finalContent
          } catch {
            // File doesn't exist yet, continue with just the new content
          }
        }

        await sandbox.files.write(file, finalContent)
        return `Successfully ${append ? "appended to" : "wrote"} file: ${file}`
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        return `Error writing to file: ${errorMessage}`
      }
    }
  })
}
