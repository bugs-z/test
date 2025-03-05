import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm/llm-config"
import { streamText } from "ai"
import { perplexity } from "@ai-sdk/perplexity"

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
    model: perplexity("r1-1776" as string),
    maxTokens: 2048,
    system: buildSystemPrompt(
      llmConfig.systemPrompts.pentestGPTReasoning,
      profile.profile_context
    ),
    messages: toVercelChatMessages(messages)
  })

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      const text = part.textDelta

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
    } else if (part.type === "reasoning") {
      // Handle native reasoning type from the model
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

  // If we're still in thinking mode at the end, close it and send thinking time
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
