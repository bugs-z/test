import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm-config"
import { streamText } from "ai"
import { perplexity } from "@ai-sdk/perplexity"

interface WebSearchConfig {
  messages: any[]
  profile: any
  dataStream: any
  isLargeModel: boolean
  directToolCall?: boolean
}

async function getProviderConfig(isLargeModel: boolean, profile: any) {
  const defaultModel = "sonar"
  const proModel = "sonar-pro"

  const selectedModel = isLargeModel ? proModel : defaultModel

  const systemPrompt = buildSystemPrompt(
    llmConfig.systemPrompts.pentestGPTWebSearch,
    profile.profile_context
  )

  return {
    systemPrompt,
    selectedModel
  }
}

export async function executeWebSearchTool({
  config
}: {
  config: WebSearchConfig
}) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("Perplexity API key is not set for web search")
  }

  const { messages, profile, dataStream, isLargeModel, directToolCall } = config
  const { systemPrompt, selectedModel } = await getProviderConfig(
    isLargeModel,
    profile
  )

  if (!directToolCall) {
    dataStream.writeData({
      type: "tool-call",
      content: "websearch"
    })
  }

  try {
    const { fullStream } = streamText({
      model: perplexity(selectedModel),
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...toVercelChatMessages(messages)
      ],
      maxTokens: 2048,
      onError: (error: unknown) => {
        console.error("[WebSearch] Streaming Error:", {
          error: error instanceof Error ? error.message : "Unknown error",
          model: selectedModel
        })
        throw error
      }
    })

    const citations: string[] = []
    let hasFirstTextDelta = false

    for await (const delta of fullStream) {
      const { type } = delta

      if (type === "source") {
        const { source } = delta
        if (source.sourceType === "url") {
          citations.push(source.url)
        }
      }

      if (type === "text-delta") {
        if (!hasFirstTextDelta) {
          // Send citations after first text-delta
          dataStream.writeData({ citations })
          hasFirstTextDelta = true

          if (!directToolCall) {
            dataStream.writeData({
              type: "tool-call",
              content: "none"
            })

            dataStream.writeData({
              type: "text-delta",
              content: "\n\n"
            })
          }
        }

        const { textDelta } = delta
        dataStream.writeData({
          type: "text-delta",
          content: textDelta
        })
      }
    }

    return "Web search completed"
  } catch (error) {
    console.error("[WebSearch] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      model: selectedModel
    })
    throw error
  }
}
