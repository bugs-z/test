import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm/llm-config"
import { streamText } from "ai"
import { myProvider } from "@/lib/ai/providers"

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
  const { messages, profile, dataStream } = config

  console.log("[ReasonLLM] Executing reasonLLM")

  await processStream({
    messages,
    profile,
    dataStream
  })

  return "Reason LLM execution completed"
}

async function processStream({
  messages,
  profile,
  dataStream
}: {
  messages: any
  profile: any
  dataStream: any
}) {
  let thinkingStartTime = null
  let enteredThinking = false

  const result = streamText({
    model: myProvider.languageModel("chat-model-reasoning"),
    maxTokens: 4096,
    system: buildSystemPrompt(
      llmConfig.systemPrompts.pentestGPTReasoning,
      profile.profile_context
    ),
    messages: toVercelChatMessages(messages)
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
