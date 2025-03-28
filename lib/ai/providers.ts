import {
  customProvider,
  wrapLanguageModel,
  extractReasoningMiddleware
} from "ai"
import { mistral } from "@ai-sdk/mistral"
import { openai } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
})

export const myProvider = customProvider({
  languageModels: {
    "chat-model-small": openrouter("deepseek/deepseek-chat-v3-0324"),
    "chat-model-large": openrouter("anthropic/claude-3.7-sonnet"),
    "chat-model-gpt-small": openai("gpt-4o-mini"),
    "chat-model-gpt-large": openai("gpt-4o-2024-11-20", {
      parallelToolCalls: false
    }),
    "chat-model-agent": openai("gpt-4o-2024-11-20", {
      parallelToolCalls: false
    }),
    "chat-model-reasoning": wrapLanguageModel({
      model: openrouter("perplexity/r1-1776"),
      middleware: extractReasoningMiddleware({ tagName: "think" })
    }),
    "deep-research": openrouter("perplexity/sonar-deep-research"),
    "vision-model": mistral("pixtral-large-latest"),
    "title-model": mistral("mistral-small-latest"),
    "standalone-question-model": mistral("mistral-small-latest")
  }
})
