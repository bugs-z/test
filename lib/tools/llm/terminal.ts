import { toVercelChatMessages } from "@/lib/ai/message-utils"
import { streamText, tool } from "ai"
import { z } from "zod"
import { executeTerminalCommand } from "./terminal-executor"
import {
  streamTerminalOutput,
  reduceTerminalOutput
} from "@/lib/ai/terminal-utils"
import { ratelimit } from "@/lib/server/ratelimiter"
import { epochTimeToNaturalLanguage } from "@/lib/utils"
import { Sandbox } from "@e2b/code-interpreter"
import {
  createOrConnectPersistentTerminal,
  createOrConnectTemporaryTerminal,
  pauseSandbox
} from "../e2b/sandbox"
import { uploadFilesToSandbox } from "@/lib/tools/e2b/file-handler"
import { createAgentTools } from "./agent-tools"
import { anthropic } from "@ai-sdk/anthropic"
import { PENTESTGPT_AGENT_SYSTEM_PROMPT } from "./agent-prompts"

const BASH_SANDBOX_TIMEOUT = 15 * 60 * 1000
const PERSISTENT_SANDBOX_TEMPLATE = "persistent-sandbox"
const TEMPORARY_SANDBOX_TEMPLATE = "temporary-sandbox"

interface TerminalToolConfig {
  messages: any[]
  profile: any
  dataStream: any
  isTerminalContinuation?: boolean
}

export async function executeTerminalTool({
  config
}: {
  config: TerminalToolConfig
}) {
  const { messages, profile, dataStream, isTerminalContinuation } = config
  let sandbox: Sandbox | null = null
  let persistentSandbox = false
  const userID = profile.user_id

  try {
    const rateLimitResult = await ratelimit(userID, "terminal")
    if (!rateLimitResult.allowed) {
      const waitTime = epochTimeToNaturalLanguage(
        rateLimitResult.timeRemaining!
      )
      dataStream.writeData({
        type: "error",
        content: `⚠️ You've reached the limit for terminal usage.\n\nTo ensure fair usage for all users, please wait ${waitTime} before trying again.`
      })
      return "Rate limit exceeded"
    }

    // Continue assistant message from previous terminal call
    const cleanedMessages = isTerminalContinuation
      ? messages.slice(0, -1)
      : messages

    const abortController = new AbortController()

    const { fullStream, finishReason } = streamText({
      model: anthropic("claude-3-7-sonnet-20250219"),
      maxTokens: 2048,
      system: PENTESTGPT_AGENT_SYSTEM_PROMPT,
      messages: toVercelChatMessages(cleanedMessages, true),
      tools: {
        terminal: tool({
          description: "Execute commands in the sandbox environment.",
          parameters: z.object({
            command: z.string().describe("Command to execute"),
            usePersistentSandbox: z
              .boolean()
              .describe(
                "Use persistent sandbox (30-day storage) instead of temporary"
              ),
            files: z
              .array(
                z.object({
                  fileId: z.string().describe("ID of the file to upload")
                })
              )
              .max(3)
              .optional()
              .describe(
                "Files to upload to sandbox before executing command (max 3 files)"
              )
          }),
          execute: async ({ command, usePersistentSandbox, files = [] }) => {
            persistentSandbox = usePersistentSandbox

            dataStream.writeData({
              type: "sandbox-type",
              sandboxType: usePersistentSandbox
                ? "persistent-sandbox"
                : "temporary-sandbox"
            })

            // Create or connect to sandbox
            if (!sandbox) {
              sandbox = usePersistentSandbox
                ? await createOrConnectPersistentTerminal(
                    userID,
                    PERSISTENT_SANDBOX_TEMPLATE,
                    BASH_SANDBOX_TIMEOUT
                  )
                : await createOrConnectTemporaryTerminal(
                    userID,
                    TEMPORARY_SANDBOX_TEMPLATE,
                    BASH_SANDBOX_TIMEOUT
                  )
            }

            // Upload requested files
            if (files.length > 0) {
              await uploadFilesToSandbox(files, sandbox, dataStream)
            }

            // Execute command
            const terminalStream = await executeTerminalCommand({
              userID,
              command,
              usePersistentSandbox,
              sandbox
            })

            let terminalOutput = ""
            await streamTerminalOutput(terminalStream, chunk => {
              dataStream.writeData({
                type: "text-delta",
                content: chunk
              })
              terminalOutput += chunk
            })
            return reduceTerminalOutput(terminalOutput)
          }
        }),
        ...createAgentTools({ dataStream })
      },
      maxSteps: 5,
      toolChoice: "required",
      abortSignal: abortController.signal
    })

    // Create a mutable variable to track if we should stop due to idle tool
    let shouldStop = false

    for await (const chunk of fullStream) {
      if (chunk.type === "text-delta") {
        dataStream.writeData({
          type: "text-delta",
          content: chunk.textDelta
        })
      } else if (chunk.type === "tool-result") {
        // Check if it's an idle tool result
        if (
          chunk.toolName === "idle" &&
          chunk.result === "Entered idle state"
        ) {
          // Send finish reason immediately and then abort
          dataStream.writeData({ finishReason: "stop" })
          abortController.abort("Idle state detected")
          shouldStop = true
        }
      } else if (chunk.type === "tool-call") {
        dataStream.writeData({
          type: "tool-call",
          content: chunk.toolName
        })
      }
    }

    // Only send finish reason if we haven't already sent it due to idle state
    if (!shouldStop) {
      const originalFinishReason = await finishReason
      dataStream.writeData({ finishReason: originalFinishReason })
    }
  } finally {
    // Pause sandbox at the end of the API request
    if (sandbox && persistentSandbox) {
      const persistentSandbox = sandbox as Sandbox
      await pauseSandbox(persistentSandbox)
    }
  }

  return "Terminal execution completed"
}
