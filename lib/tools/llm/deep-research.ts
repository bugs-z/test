import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm/llm-config"
import { streamText } from "ai"
import { myProvider } from "@/lib/ai/providers"

interface DeepResearchConfig {
  messages: any[]
  profile: any
  dataStream: any
}

export async function executeDeepResearchTool({
  config
}: {
  config: DeepResearchConfig
}) {
  const { messages, profile, dataStream } = config

  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("Perplexity API key is not set for reason LLM")
  }

  console.log("Executing DeepResearch for user", profile.user_id)

  await processStream({
    messages,
    profile,
    dataStream
  })

  return "[DeepResearch] Execution completed"
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
  let sentFirstTextDelta = false
  const sourceUrls: string[] = []

  const result = streamText({
    model: myProvider.languageModel("deep-research"),
    maxTokens: 8192,
    system: buildSystemPrompt(
      llmConfig.systemPrompts.reasoningWebSearch,
      profile.profile_context
    ),
    messages: toVercelChatMessages(messages)
  })

  if (!result || !result.fullStream) {
    console.error("No result from deep research")
    throw new Error("No result from deep research")
  }

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
