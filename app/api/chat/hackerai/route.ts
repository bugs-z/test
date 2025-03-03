import { getAIProfile } from "@/lib/server/server-chat-helpers"
import { ServerRuntime } from "next"
import { buildSystemPrompt } from "@/lib/ai/prompts"
import {
  filterEmptyAssistantMessages,
  handleAssistantMessages,
  messagesIncludeImages,
  toVercelChatMessages,
  validateMessages
} from "@/lib/build-prompt"
import { handleErrorResponse } from "@/lib/models/llm/api-error"
import llmConfig from "@/lib/models/llm/llm-config"
import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"
import { createOpenAI as createOpenRouterAI } from "@ai-sdk/openai"
import { createMistral } from "@ai-sdk/mistral"
import { createAnthropic } from "@ai-sdk/anthropic"
import { LanguageModelV1, streamText } from "ai"
import { getModerationResult } from "@/lib/server/moderation"
import { PluginID } from "@/types/plugins"
import { executeWebSearchTool } from "@/lib/tools/llm/web-search"
import { createStreamResponse } from "@/lib/ai-helper"
import { LargeModel } from "@/lib/models/llm/hackerai-llm-list"
import { executeReasonLLMTool } from "@/lib/tools/llm/reason-llm"
import { executeReasoningWebSearchTool } from "@/lib/tools/llm/reasoning-web-search"
import { geolocation } from "@vercel/functions"
import { processRag } from "@/lib/rag/rag-processor"
import { executeDeepResearchTool } from "@/lib/tools/llm/deep-research"

export const runtime: ServerRuntime = "edge"
export const preferredRegion = [
  "iad1",
  "arn1",
  "bom1",
  "cdg1",
  "cle1",
  "cpt1",
  "dub1",
  "fra1",
  "gru1",
  "hnd1",
  "icn1",
  "kix1",
  "lhr1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1"
]

export async function POST(request: Request) {
  const {
    messages,
    chatSettings,
    isRetrieval,
    isContinuation,
    isRagEnabled,
    selectedPlugin
  } = await request.json()

  try {
    const profile = await getAIProfile()
    const config = await getProviderConfig(
      chatSettings,
      profile,
      selectedPlugin
    )

    if (!config.selectedModel) {
      throw new Error("Selected model is undefined")
    }
    if (config.rateLimitCheckResult !== null) {
      return config.rateLimitCheckResult.response
    }

    // Build system prompt
    const baseSystemPrompt = config.isLargeModel
      ? llmConfig.systemPrompts.largeModel
      : llmConfig.systemPrompts.smallModel
    let systemPrompt = buildSystemPrompt(
      baseSystemPrompt,
      profile.profile_context
    )

    // Process RAG
    let ragUsed = false
    let ragId: string | null = null
    const shouldUseRAG = !isRetrieval && isRagEnabled

    if (shouldUseRAG) {
      const ragResult = await processRag({
        messages,
        isContinuation,
        profile
      })

      ragUsed = ragResult.ragUsed
      ragId = ragResult.ragId
      if (ragResult.systemPrompt) {
        systemPrompt = ragResult.systemPrompt
      }
    }

    const includeImages = messagesIncludeImages(messages)
    let selectedModel = config.selectedModel
    let shouldUncensorResponse = false

    const { region } = geolocation(request)
    if (!config.isLargeModel && region === "bom1") {
      selectedModel = "mistral-saba-2502"
    }

    const handleMessages = (shouldUncensor: boolean) => {
      if (!config.isLargeModel && includeImages) {
        selectedModel = "pixtral-large-2411"
        return filterEmptyAssistantMessages(messages)
      }

      if (shouldUncensor) {
        return handleAssistantMessages(messages)
      }

      return filterEmptyAssistantMessages(messages)
    }

    if (
      llmConfig.openai.apiKey &&
      !includeImages &&
      !isContinuation &&
      selectedPlugin !== PluginID.WEB_SEARCH &&
      selectedPlugin !== PluginID.REASONING &&
      selectedPlugin !== PluginID.REASONING_WEB_SEARCH &&
      region !== "bom1"
    ) {
      const { shouldUncensorResponse: moderationResult } =
        await getModerationResult(
          messages,
          llmConfig.openai.apiKey || "",
          10,
          config.isLargeModel
        )
      shouldUncensorResponse = moderationResult
    }

    handleMessages(shouldUncensorResponse)

    switch (selectedPlugin) {
      case PluginID.WEB_SEARCH:
        return createStreamResponse(async dataStream => {
          await executeWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: config.isLargeModel
            }
          })
        })

      case PluginID.REASONING:
        return createStreamResponse(async dataStream => {
          await executeReasonLLMTool({
            config: { messages, profile, dataStream }
          })
        })

      case PluginID.REASONING_WEB_SEARCH:
        return createStreamResponse(async dataStream => {
          await executeReasoningWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: config.isLargeModel
            }
          })
        })

      case PluginID.DEEP_RESEARCH:
        return createStreamResponse(async dataStream => {
          await executeDeepResearchTool({
            config: {
              messages,
              profile,
              dataStream
            }
          })
        })
    }

    const provider = createProvider(selectedModel, config)

    // Remove last message if it's a continuation to remove the continue prompt
    const cleanedMessages = isContinuation ? messages.slice(0, -1) : messages

    // Remove invalid message exchanges
    const validatedMessages = validateMessages(cleanedMessages)

    try {
      return createStreamResponse(dataStream => {
        dataStream.writeData({ ragUsed, ragId })

        const result = streamText({
          model: provider(selectedModel) as LanguageModelV1,
          system:
            selectedModel == "claude-3-7-sonnet-20250219"
              ? undefined
              : systemPrompt,
          messages: toVercelChatMessages(
            validatedMessages,
            includeImages,
            selectedModel == "claude-3-7-sonnet-20250219"
              ? systemPrompt
              : undefined
          ),
          maxTokens: 2048,
          abortSignal: request.signal
        })

        result.mergeIntoDataStream(dataStream)
      })
    } catch (error) {
      return handleErrorResponse(error)
    }
  } catch (error: any) {
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}

async function getProviderConfig(
  chatSettings: any,
  profile: any,
  selectedPlugin: PluginID
) {
  const isLargeModel = chatSettings.model === LargeModel.modelId

  const defaultModel = llmConfig.models.small
  const proModel = llmConfig.models.large

  const providerUrl = llmConfig.openrouter.url
  const providerBaseUrl = llmConfig.openrouter.baseURL

  const providerHeaders = {
    Authorization: `Bearer ${llmConfig.openrouter.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": `https://pentestgpt.com/${chatSettings.model}`,
    "X-Title": chatSettings.model
  }

  const selectedModel = isLargeModel ? proModel : defaultModel
  const rateLimitCheckResult = await checkRatelimitOnApi(
    profile.user_id,
    selectedPlugin === PluginID.REASONING ||
      selectedPlugin === PluginID.REASONING_WEB_SEARCH
      ? "reasoning"
      : selectedPlugin === PluginID.DEEP_RESEARCH
        ? "deep-research"
        : isLargeModel
          ? "pentestgpt-pro"
          : "pentestgpt"
  )

  return {
    providerUrl,
    providerBaseUrl,
    providerHeaders,
    selectedModel,
    rateLimitCheckResult,
    isLargeModel
  }
}

function createProvider(selectedModel: string, config: any) {
  if (
    selectedModel.startsWith("mistral-") ||
    selectedModel.startsWith("pixtral") ||
    selectedModel.startsWith("codestral")
  ) {
    return createMistral()
  }
  if (selectedModel.startsWith("claude-")) {
    return createAnthropic()
  }
  return createOpenRouterAI({
    baseURL: config.providerBaseUrl,
    headers: config.providerHeaders
  })
}
