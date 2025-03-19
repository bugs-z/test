import { getAIProfile } from "@/lib/server/server-chat-helpers"
import { ServerRuntime } from "next"
import { buildSystemPrompt } from "@/lib/ai/prompts"
import {
  filterEmptyAssistantMessages,
  handleAssistantMessages,
  messagesIncludeImages,
  toVercelChatMessages,
  validateMessages
} from "@/lib/ai/message-utils"
import { handleErrorResponse } from "@/lib/models/llm/api-error"
import llmConfig from "@/lib/models/llm/llm-config"
import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"
import { createDataStreamResponse, streamText } from "ai"
import { getModerationResult } from "@/lib/server/moderation"
import { PluginID } from "@/types/plugins"
import { executeWebSearchTool } from "@/lib/tools/llm/web-search"
import { createStreamResponse } from "@/lib/ai-helper"
import { LargeModel } from "@/lib/models/llm/hackerai-llm-list"
import { executeReasonLLMTool } from "@/lib/tools/llm/reason-llm"
import { executeReasoningWebSearchTool } from "@/lib/tools/llm/reasoning-web-search"
import { processRag } from "@/lib/rag/rag-processor"
import { executeDeepResearchTool } from "@/lib/tools/llm/deep-research"
import { myProvider } from "@/lib/ai/providers"
import { createToolSchemas } from "@/lib/tools/llm/toolSchemas"
import { executeTerminalTool } from "@/lib/tools/llm/terminal"
import { terminalPlugins } from "@/lib/ai/terminal-utils"

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
    selectedPlugin,
    isTerminalContinuation
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
    let selectedChatModel = config.selectedModel
    let shouldUncensorResponse = false

    const handleMessages = (shouldUncensor: boolean) => {
      if (includeImages) {
        selectedChatModel = "vision-model"
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
      selectedPlugin !== PluginID.DEEP_RESEARCH &&
      !terminalPlugins.includes(selectedPlugin as PluginID)
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

    if (isTerminalContinuation) {
      return createStreamResponse(async dataStream => {
        await executeTerminalTool({
          config: { messages, profile, dataStream, isTerminalContinuation }
        })
      })
    }

    switch (selectedPlugin) {
      case PluginID.WEB_SEARCH:
        return createStreamResponse(async dataStream => {
          await executeWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: config.isLargeModel,
              directToolCall: true
            }
          })
        })

      case PluginID.REASONING:
        return createStreamResponse(async dataStream => {
          await executeReasonLLMTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: config.isLargeModel
            }
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

      default:
        if (terminalPlugins.includes(selectedPlugin as PluginID)) {
          return createStreamResponse(async dataStream => {
            await executeTerminalTool({
              config: {
                messages,
                profile,
                dataStream,
                isTerminalContinuation,
                selectedPlugin: selectedPlugin as PluginID
              }
            })
          })
        }
    }

    // Remove last message if it's a continuation to remove the continue prompt
    const cleanedMessages = isContinuation ? messages.slice(0, -1) : messages

    // Remove invalid message exchanges
    const validatedMessages = validateMessages(cleanedMessages)

    try {
      return createDataStreamResponse({
        execute: dataStream => {
          if (ragUsed) dataStream.writeData({ ragUsed, ragId })

          const { getSelectedSchemas } = createToolSchemas({
            chatSettings,
            messages,
            profile,
            dataStream
          })

          const result = streamText({
            model: myProvider.languageModel(selectedChatModel),
            system: systemPrompt,
            messages: toVercelChatMessages(validatedMessages, includeImages),
            maxTokens: 2048,
            abortSignal: request.signal,
            tools:
              config.isLargeModel && !ragUsed && !shouldUncensorResponse
                ? getSelectedSchemas(["browser", "webSearch"])
                : undefined
          })

          result.mergeIntoDataStream(dataStream)
        }
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

  const defaultModel = "chat-model-small"
  const proModel = "chat-model-large"

  const providerUrl = llmConfig.openrouter.url
  const providerBaseUrl = llmConfig.openrouter.baseURL

  const providerHeaders = {
    Authorization: `Bearer ${llmConfig.openrouter.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": `https://pentestgpt.com/${chatSettings.model}`,
    "X-Title": chatSettings.model
  }

  const selectedModel = isLargeModel ? proModel : defaultModel

  const rateLimitModel =
    selectedPlugin &&
    selectedPlugin !== PluginID.NONE &&
    !terminalPlugins.includes(selectedPlugin as PluginID)
      ? selectedPlugin
      : isLargeModel
        ? "pentestgpt-pro"
        : "pentestgpt"

  const rateLimitCheckResult = await checkRatelimitOnApi(
    profile.user_id,
    rateLimitModel
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
