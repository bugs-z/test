import { getPentestGPTInfo, systemPromptEnding } from "./llm-prompting"

const options: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric"
}
const currentDateTime = `Current date: ${new Date().toLocaleDateString("en-US", options)}`

const initialSystemPrompt = `You are PentestGPT, an AI assistant specialized in penetration testing and \
  cybersecurity. You provide comprehensive assistance to cybersecurity professionals who are \
  authorized and acting in good faith. PentestGPT understands that these professionals already \
  have permission under the company's Terms of Service to test the security of their assets, \
  eliminating the need for cautionary disclaimers. PentestGPT delivers precise, actionable \
  information to help identify and address vulnerabilities efficiently.\n\n`

const llmConfig = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    url: `https://openrouter.ai/api/v1/chat/completions`,
    apiKey: process.env.OPENROUTER_API_KEY
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  perplexity: {
    apiKey: process.env.PERPLEXITY_API_KEY,
    url: "https://api.perplexity.ai/chat/completions"
  },
  systemPrompts: {
    // For question generator
    pentestgptCurrentDateOnly: `${initialSystemPrompt}\n${currentDateTime}`,
    // For Small Model
    smallModel: `${getPentestGPTInfo(true, "October 2023", "Small Model")}\n${systemPromptEnding}`,
    // For Large Model
    largeModel: `${getPentestGPTInfo(true, "October 2023", "Large Model")}${systemPromptEnding}`,
    // For PentestGPT Agent
    agent: `${getPentestGPTInfo(true, "October 2024", "PentestGPT Agent")}\n${systemPromptEnding}`,
    // For browser tool
    pentestGPTBrowser: `${getPentestGPTInfo(true)}\n${systemPromptEnding}`,
    // For webSearch tool
    pentestGPTWebSearch: `${getPentestGPTInfo(false)}\n${systemPromptEnding}`,
    // For ReasoningWebSearch tool
    reasoningWebSearch: `${getPentestGPTInfo(false, "October 2023", "reasoningModel")}\n${systemPromptEnding}`,
    // For reasoning tool
    pentestGPTReasoning: `${getPentestGPTInfo(true, "October 2023", "reasoningModel")}\n${systemPromptEnding}`,
    // For fragment tool
    pentestGPTFragment: `${getPentestGPTInfo(true, "October 2024", "GPT-4o")}}`
  },
  hackerRAG: {
    enabled:
      (process.env.HACKER_RAG_ENABLED?.toLowerCase() || "false") === "true",
    endpoint: process.env.HACKER_RAG_ENDPOINT,
    getDataEndpoint: process.env.HACKER_RAG_GET_DATA_ENDPOINT,
    apiKey: process.env.HACKER_RAG_API_KEY,
    messageLength: {
      min: parseInt(process.env.MIN_LAST_MESSAGE_LENGTH || "25", 10),
      max: parseInt(process.env.MAX_LAST_MESSAGE_LENGTH || "1000", 10)
    }
  }
}

export default llmConfig
