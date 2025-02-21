import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages, removeLastSureMessage } from "@/lib/build-prompt"
import llmConfig from "@/lib/models/llm/llm-config"

interface WebSearchConfig {
  messages: any[]
  profile: any
  dataStream: any
  isLargeModel: boolean
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

  const { messages, profile, dataStream, isLargeModel } = config

  const { systemPrompt, selectedModel } = await getProviderConfig(
    isLargeModel,
    profile
  )

  console.log("[WebSearch] Executing web search with model:", selectedModel)

  const cleanedMessages = removeLastSureMessage(messages)

  const response = await fetch(llmConfig.perplexity.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmConfig.perplexity.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...toVercelChatMessages(cleanedMessages)
      ],
      max_tokens: 1024,
      stream: true
    })
  })

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let isFirstChunk = true

  try {
    while (true) {
      const { done, value } = (await reader?.read()) || {
        done: true,
        value: undefined
      }
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6)
        if (data === "[DONE]") continue

        const parsed = JSON.parse(data)

        // Handle citations only on first chunk
        if (isFirstChunk) {
          const citations = parsed.citations
          if (citations?.length) {
            dataStream.writeData({ citations: citations })
          }
          isFirstChunk = false
        }

        // Handle content
        const content = parsed.choices[0]?.delta?.content
        if (content) {
          dataStream.writeData({
            type: "text-delta",
            content: content
          })
        }
      }
    }
  } catch (e) {
    console.error("Stream processing error:", e)
  }

  return "Web search completed"
}
