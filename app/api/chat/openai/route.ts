import { replaceWordsInLastUserMessage } from "@/lib/ai-helper"
import { buildSystemPrompt } from "@/lib/ai/prompts"
import {
  filterEmptyAssistantMessages,
  toVercelChatMessages
} from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm/llm-config"
import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"
import { getAIProfile } from "@/lib/server/server-chat-helpers"
import { createDataStreamResponse, streamText } from "ai"
import { ServerRuntime } from "next"
import { createToolSchemas } from "@/lib/tools/llm/toolSchemas"
import { PluginID } from "@/types/plugins"
import { executeWebSearchTool } from "@/lib/tools/llm/web-search"
import { createStreamResponse } from "@/lib/ai-helper"
import { executeTerminalTool } from "@/lib/tools/llm/terminal"
import { executeReasonLLMTool } from "@/lib/tools/llm/reason-llm"
import { executeReasoningWebSearchTool } from "@/lib/tools/llm/reasoning-web-search"
import { processRag } from "@/lib/rag/rag-processor"
import { executeDeepResearchTool } from "@/lib/tools/llm/deep-research"
import { myProvider } from "@/lib/ai/providers"
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
  try {
    const {
      messages,
      chatSettings,
      isRetrieval,
      isContinuation,
      isRagEnabled,
      selectedPlugin,
      isTerminalContinuation
    } = await request.json()

    const profile = await getAIProfile()
    const rateLimitModel =
      selectedPlugin &&
      selectedPlugin !== PluginID.NONE &&
      !terminalPlugins.includes(selectedPlugin as PluginID)
        ? selectedPlugin
        : "gpt-4"

    const rateLimitCheckResult = await checkRatelimitOnApi(
      profile.user_id,
      rateLimitModel
    )
    if (rateLimitCheckResult !== null) {
      return rateLimitCheckResult.response
    }

    let systemPrompt = buildSystemPrompt(
      llmConfig.systemPrompts.agent,
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

    filterEmptyAssistantMessages(messages)
    replaceWordsInLastUserMessage(messages)

    if (isTerminalContinuation) {
      return createStreamResponse(async dataStream => {
        await executeTerminalTool({
          config: { messages, profile, dataStream, isTerminalContinuation }
        })
      })
    }

    // Handle special plugins
    switch (selectedPlugin) {
      case PluginID.WEB_SEARCH:
        return createStreamResponse(async dataStream => {
          await executeWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel: true,
              directToolCall: true
            }
          })
        })

      case PluginID.TERMINAL:
        return createStreamResponse(async dataStream => {
          await executeTerminalTool({
            config: { messages, profile, dataStream, isTerminalContinuation }
          })
        })

      case PluginID.REASONING:
        return createStreamResponse(async dataStream => {
          await executeReasonLLMTool({
            config: { messages, profile, dataStream, isLargeModel: true }
          })
        })

      case PluginID.REASONING_WEB_SEARCH:
        return createStreamResponse(async dataStream => {
          await executeReasoningWebSearchTool({
            config: { messages, profile, dataStream, isLargeModel: true }
          })
        })

      case PluginID.DEEP_RESEARCH:
        return createStreamResponse(async dataStream => {
          await executeDeepResearchTool({
            config: { messages, profile, dataStream }
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

    return createDataStreamResponse({
      execute: dataStream => {
        if (ragUsed) dataStream.writeData({ ragUsed, ragId })

        const { getSelectedSchemas } = createToolSchemas({
          chatSettings,
          messages,
          profile,
          dataStream,
          isTerminalContinuation
        })

        const result = streamText({
          model: myProvider.languageModel("chat-model-gpt-large"),
          messages: toVercelChatMessages(messages, true, systemPrompt),
          maxTokens: 2048,
          abortSignal: request.signal,
          tools: getSelectedSchemas(["browser", "webSearch", "terminal"])
        })

        result.mergeIntoDataStream(dataStream)
      }
    })
  } catch (error: any) {
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
