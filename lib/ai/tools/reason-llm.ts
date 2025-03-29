import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm-config"
import { streamText } from "ai"
import { myProvider } from "@/lib/ai/providers"

interface ReasonLLMConfig {
  messages: any[]
  profile: any
  dataStream: any
  isLargeModel: boolean
}

type Delta = {
  type: "text-delta" | "reasoning" | "thinking-time"
  textDelta?: string
  content?: string
  elapsed_secs?: number
}

async function getProviderConfig(profile: any) {
  const systemPrompt = buildSystemPrompt(
    llmConfig.systemPrompts.pentestGPTReasoning,
    profile.profile_context
  )

  return {
    systemPrompt,
    model: myProvider.languageModel("chat-model-reasoning")
  }
}

export async function executeReasonLLMTool({
  config
}: {
  config: ReasonLLMConfig
}) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("Perplexity API key is not set for reason LLM")
  }

  const { messages, profile, dataStream } = config
  const { systemPrompt, model } = await getProviderConfig(profile)

  try {
    const { fullStream } = streamText({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...toVercelChatMessages(messages)
      ],
      maxTokens: 4096,
      onError: (error: unknown) => {
        console.error("[ReasonLLM] Streaming Error:", {
          error: error instanceof Error ? error.message : "Unknown error",
          model
        })
        throw error
      }
    })

    let thinkingStartTime: number | null = null
    let isThinking = false

    for await (const delta of fullStream) {
      const { type } = delta as Delta

      if (type === "text-delta") {
        const { textDelta } = delta as Delta
        dataStream.writeData({
          type: "text-delta",
          content: textDelta
        })
      }

      if (type === "reasoning") {
        if (!isThinking) {
          isThinking = true
          thinkingStartTime = Date.now()
        }

        const { content } = delta as Delta
        dataStream.writeData({
          type: "reasoning",
          content
        })
      }
    }

    if (isThinking && thinkingStartTime) {
      isThinking = false
      const thinkingElapsedSecs = Math.round(
        (Date.now() - thinkingStartTime) / 1000
      )
      dataStream.writeData({
        type: "thinking-time",
        elapsed_secs: thinkingElapsedSecs
      })
    }

    return "Reason LLM execution completed"
  } catch (error) {
    console.error("[ReasonLLM] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      model
    })
    throw error
  }
}
