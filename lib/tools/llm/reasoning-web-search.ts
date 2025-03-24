import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm/llm-config"
import { streamText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

interface ReasoningWebSearchConfig {
  messages: any[]
  profile: any
  dataStream: any
  isLargeModel: boolean
}

export async function executeReasoningWebSearchTool({
  config
}: {
  config: ReasoningWebSearchConfig
}) {
  const { messages, profile, dataStream, isLargeModel } = config

  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("Perplexity API key is not set for reason LLM")
  }

  console.log("Executing ReasoningWebSearch for user", profile.user_id)

  const defaultModel = "sonar-reasoning"
  const proModel = "sonar-reasoning-pro"

  const selectedModel = isLargeModel ? proModel : defaultModel

  await processStream({
    messages,
    profile,
    dataStream,
    selectedModel
  })

  return "[ReasoningWebSearch] Execution completed"
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
  let sentFirstTextDelta = false
  const sourceUrls: string[] = []

  const openrouter = createOpenRouter({
    apiKey: llmConfig.openrouter.apiKey
  })

  const result = streamText({
    model: openrouter(`perplexity/${selectedModel}`),
    maxTokens: 4096,
    system: buildSystemPrompt(
      llmConfig.systemPrompts.reasoningWebSearch,
      profile.profile_context
    ),
    messages: toVercelChatMessages(messages)
  })

  for await (const part of result.fullStream) {
    // Collect source URLs
    if (
      part.type === "source" &&
      part.source?.sourceType === "url" &&
      part.source?.url
    ) {
      sourceUrls.push(part.source.url)
      continue
    }

    if (part.type === "text-delta") {
      const text = part.textDelta

      // Send collected URLs after first text-delta
      if (!sentFirstTextDelta && text.trim() !== "") {
        sentFirstTextDelta = true
        if (sourceUrls.length > 0) {
          dataStream.writeData({ citations: sourceUrls })
        }
      }

      if (text.includes("<think>")) {
        enteredThinking = true
        thinkingStartTime = Date.now()
        // Send text before <think> if any
        const beforeThink = text.split("<think>")[0]
        if (beforeThink) {
          dataStream.writeData({
            type: "text-delta",
            content: beforeThink
          })
        }
        // Send thinking content immediately
        const thinkingContent = text.split("<think>")[1] || ""
        if (thinkingContent) {
          dataStream.writeData({
            type: "reasoning",
            content: thinkingContent
          })
        }
        continue
      }

      if (enteredThinking) {
        if (text.includes("</think>")) {
          // Handle end of thinking block
          enteredThinking = false
          const thinkingElapsedSecs = thinkingStartTime
            ? Math.round((Date.now() - thinkingStartTime) / 1000)
            : null

          // Send thinking content before </think>
          const finalThinking = text.split("</think>")[0]
          if (finalThinking) {
            dataStream.writeData({
              type: "reasoning",
              content: finalThinking
            })
          }

          // Send thinking time
          dataStream.writeData({
            type: "thinking-time",
            elapsed_secs: thinkingElapsedSecs
          })

          // Send remaining text after </think> if any
          const afterThink = text.split("</think>")[1]
          if (afterThink) {
            dataStream.writeData({
              type: "text-delta",
              content: afterThink
            })
          }
        } else {
          // Send thinking content immediately
          dataStream.writeData({
            type: "reasoning",
            content: text
          })
        }
      } else {
        // Immediately send non-thinking text
        dataStream.writeData({
          type: "text-delta",
          content: text
        })
      }
    }
  }
}
