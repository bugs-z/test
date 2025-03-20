import { toVercelChatMessages } from "@/lib/ai/message-utils"
import { streamText } from "ai"
import { ratelimit } from "@/lib/server/ratelimiter"
import { epochTimeToNaturalLanguage } from "@/lib/utils"
import { Sandbox } from "@e2b/code-interpreter"
import { pauseSandbox } from "../e2b/sandbox"
import { createAgentTools } from "@/lib/ai/tools"
import { PENTESTGPT_AGENT_SYSTEM_PROMPT } from "./agent-prompts"
import { getSubscriptionInfo } from "@/lib/server/subscription-utils"
import { PluginID } from "@/types/plugins"
import { isFreePlugin } from "../tool-store/tools-helper"
import { getToolsWithAnswerPrompt } from "../tool-store/prompts/system-prompt"
import { getTerminalTemplate } from "@/lib/tools/tool-store/tools-helper"
import { myProvider } from "@/lib/ai/providers"

// Constants
const TEMPORARY_SANDBOX_TEMPLATE = "temporary-sandbox"

interface TerminalToolConfig {
  messages: any[]
  profile: any
  dataStream: any
  isTerminalContinuation?: boolean
  selectedPlugin?: PluginID
  previousMessage?: string
}

export async function executeTerminalTool({
  config
}: {
  config: TerminalToolConfig
}) {
  const {
    messages,
    profile,
    dataStream,
    isTerminalContinuation,
    selectedPlugin
    // previousMessage
  } = config
  let sandbox: Sandbox | null = null
  let persistentSandbox = false
  const userID = profile.user_id
  let systemPrompt = PENTESTGPT_AGENT_SYSTEM_PROMPT
  let terminalTemplate = TEMPORARY_SANDBOX_TEMPLATE
  let selectedChatModel = "chat-model-agent"

  try {
    // Check rate limit
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

    // Handle plugin-specific setup
    if (selectedPlugin) {
      const subscriptionInfo = await getSubscriptionInfo(userID)

      if (!isFreePlugin(selectedPlugin) && !subscriptionInfo.isPremium) {
        dataStream.writeData({
          type: "error",
          content: `Access Denied to ${selectedPlugin}: The plugin you are trying to use is exclusive to Pro and Team members. Please upgrade to access this plugin.`
        })
        return "Access Denied to plugin"
      }

      if (!subscriptionInfo.isPremium)
        selectedChatModel = "chat-model-gpt-large"

      systemPrompt = getToolsWithAnswerPrompt(selectedPlugin)
      terminalTemplate = getTerminalTemplate(selectedPlugin)
    }

    // Continue assistant message from previous terminal call
    const cleanedMessages = isTerminalContinuation
      ? messages.slice(0, -1)
      : messages

    // Functions to update sandbox and persistentSandbox from tools
    const setSandbox = (newSandbox: Sandbox) => {
      sandbox = newSandbox
    }

    const setPersistentSandbox = (isPersistent: boolean) => {
      persistentSandbox = isPersistent
    }

    // if (previousMessage) {
    //   cleanedMessages.push({
    //     role: "assistant",
    //     content: previousMessage + "\n\n "
    //   })
    // }

    const { fullStream, finishReason } = streamText({
      model: myProvider.languageModel(selectedChatModel),
      maxTokens: 2048,
      system: systemPrompt,
      messages: toVercelChatMessages(cleanedMessages, true),
      tools: createAgentTools({
        dataStream,
        sandbox,
        userID,
        persistentSandbox,
        selectedPlugin,
        terminalTemplate,
        setSandbox,
        setPersistentSandbox
      }),
      maxSteps: 5,
      toolChoice: "required"
    })

    // Handle stream
    let shouldStop = false
    for await (const chunk of fullStream) {
      if (chunk.type === "text-delta") {
        dataStream.writeData({
          type: "text-delta",
          content: chunk.textDelta
        })
      } else if (chunk.type === "tool-call") {
        if (
          chunk.toolName === "idle" ||
          chunk.toolName === "message_ask_user"
        ) {
          dataStream.writeData({ finishReason: "stop" })
          shouldStop = true

          if (chunk.toolName === "message_ask_user") {
            dataStream.writeData({
              type: "text-delta",
              content: chunk.args.text
            })
          }
        }

        dataStream.writeData({
          type: "tool-call",
          content: chunk.toolName
        })
      }
    }

    // Send finish reason if not already sent
    if (!shouldStop) {
      const originalFinishReason = await finishReason
      dataStream.writeData({ finishReason: originalFinishReason })
    }
  } finally {
    // Pause sandbox at the end of the API request
    if (sandbox && persistentSandbox) {
      await pauseSandbox(sandbox)
    }
  }

  return "Terminal execution completed"
}
