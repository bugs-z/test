import { customProvider } from "ai"
import { mistral } from "@ai-sdk/mistral"
import { openai } from "@ai-sdk/openai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { perplexity } from "@ai-sdk/perplexity"

export const myProvider = customProvider({
  languageModels: {
    "chat-model-small": openrouter("google/gemma-3-27b-it"),
    "chat-model-large": mistral("mistral-large-latest"),
    "chat-model-gpt-small": openai("gpt-4o-mini"),
    "chat-model-gpt-large": openai("gpt-4o", { parallelToolCalls: false }),
    "chat-model-reasoning": openrouter("deepseek/deepseek-r1"),
    "deep-research": perplexity("sonar-deep-research"),
    "vision-model": mistral("pixtral-large-latest"),
    "title-model": mistral("mistral-small-latest"),
    "standalone-question-model": mistral("mistral-small-latest")
  }
})
