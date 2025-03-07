import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm/llm-config"
import { smoothStream, streamText } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"

interface ReasonLLMConfig {
  messages: any[]
  profile: any
  dataStream: any
  isLargeModel: boolean
}

export async function executeReasonLLMTool({
  config
}: {
  config: ReasonLLMConfig
}) {
  const { messages, profile, dataStream, isLargeModel } = config

  console.log("[ReasonLLM] Executing reasonLLM")

  const defaultModel = "deepseek/deepseek-r1"
  const proModel = "deepseek/deepseek-r1"

  const selectedModel = isLargeModel ? proModel : defaultModel

  await processStream({
    messages,
    profile,
    dataStream,
    selectedModel
  })

  return "Reason LLM execution completed"
}

async function processStream({
  messages,
  profile,
  dataStream,
  selectedModel
}: {
  messages: any
  profile: any
  dataStream: any
  selectedModel: string
}) {
  let thinkingStartTime = null
  let enteredThinking = false

  const result = streamText({
    model: openrouter(selectedModel as string),
    maxTokens: 2048,
    system: buildSystemPrompt(
      llmConfig.systemPrompts.pentestGPTReasoning,
      profile.profile_context
    ),
    messages: toVercelChatMessages(messages),
    experimental_transform: smoothStream({ chunking: "word" })
  })

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      dataStream.writeData({
        type: "text-delta",
        content: part.textDelta
      })
    } else if (part.type === "reasoning") {
      if (!enteredThinking) {
        enteredThinking = true
        thinkingStartTime = Date.now()
      }

      dataStream.writeData({
        type: "reasoning",
        content: part.textDelta
      })
    }
  }

  if (enteredThinking && thinkingStartTime) {
    enteredThinking = false
    const thinkingElapsedSecs = Math.round(
      (Date.now() - thinkingStartTime) / 1000
    )
    dataStream.writeData({
      type: "thinking-time",
      elapsed_secs: thinkingElapsedSecs
    })
  }
}
