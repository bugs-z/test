import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/build-prompt"
import llmConfig from "@/lib/models/llm/llm-config"
import { streamText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

interface ReasonLLMConfig {
  messages: any[]
  profile: any
  dataStream: any
}

export async function executeReasonLLMTool({
  config
}: {
  config: ReasonLLMConfig
}) {
  const { messages, profile, dataStream } = config

  const reasoningProvider = initializeOpenRouter()

  console.log("[ReasonLLM] Executing reasonLLM")

  await processStream({
    reasoningProvider,
    messages,
    profile,
    dataStream
  })

  return "Reason LLM execution completed"
}

function initializeOpenRouter() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key is not set for reason LLM")
  }
  return createOpenRouter({
    extraBody: { include_reasoning: true }
  })
}

async function processStream({
  reasoningProvider,
  messages,
  profile,
  dataStream
}: {
  reasoningProvider: any
  messages: any
  profile: any
  dataStream: any
}) {
  let thinkingStartTime = null
  let enteredReasoning = false
  let enteredText = false

  const result = streamText({
    model: reasoningProvider(llmConfig.models.reasoning as string),
    temperature: 0.5,
    maxTokens: 2048,
    system: buildSystemPrompt(
      llmConfig.systemPrompts.pentestGPTChat,
      profile.profile_context
    ),
    messages: toVercelChatMessages(messages)
  })

  for await (const part of result.fullStream) {
    if (part.type === "reasoning" && !enteredReasoning) {
      enteredReasoning = true
      thinkingStartTime = Date.now()
      dataStream.writeData({ type: "reasoning", content: part.textDelta })
    } else if (part.type === "text-delta" && !enteredText) {
      enteredText = true
      if (thinkingStartTime) {
        const thinkingElapsedSecs = Math.round(
          (Date.now() - thinkingStartTime) / 1000
        )
        dataStream.writeData({
          type: "thinking-time",
          elapsed_secs: thinkingElapsedSecs
        })
      }
      dataStream.writeData({ type: "text-delta", content: part.textDelta })
    } else {
      if (part.type === "text-delta" || part.type === "reasoning") {
        dataStream.writeData({
          type: part.type,
          content: part.textDelta
        })
      }
    }
  }
}
