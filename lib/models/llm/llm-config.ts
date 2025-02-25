import {
  TERMINAL_OUTPUT_ANALYSIS_INSTRUCTIONS,
  TERMINAL_TOOL_INSTRUCTIONS
} from "@/lib/backend-config"
import {
  getPentestGPTInfo,
  systemPromptEnding,
  getPentestGPTToolsInfo
} from "./llm-prompting"

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
    // For PGPT-Small
    smallModel: `${getPentestGPTInfo(true, false, "October 2023", "PGPT-Small")}\n${systemPromptEnding}`,
    // For PGPT-Large
    largeModel: `${getPentestGPTInfo(true, false, "October 2023", "PGPT-Large")}\n${systemPromptEnding}`,
    // For PentestGPT-4o
    gpt4o: `${getPentestGPTInfo(true, true, "October 2024", "PentestGPT-4o")}\n${getPentestGPTToolsInfo(true, true, true, true)}\n${systemPromptEnding}`,
    // For browser tool
    pentestGPTBrowser: `${getPentestGPTInfo(true, true)}\n${systemPromptEnding}`,
    // For webSearch tool
    pentestGPTWebSearch: `${getPentestGPTInfo(false, true)}\n${systemPromptEnding}`,
    // For reasoning tool
    pentestGPTReasoning: `${getPentestGPTInfo(true)}\n${systemPromptEnding}`,
    // For terminal tool
    pentestGPTTerminal: `${getPentestGPTInfo()}\n${TERMINAL_TOOL_INSTRUCTIONS}\n${TERMINAL_OUTPUT_ANALYSIS_INSTRUCTIONS}\n${systemPromptEnding}`,
    // For fragment tool
    pentestGPTFragment: `${getPentestGPTInfo(true, false, "October 2024", "PentestGPT-4o")}}`
  },
  models: {
    small: process.env.OPENROUTER_PENTESTGPT_DEFAULT_MODEL,
    standalone_question: process.env.OPENROUTER_STANDALONE_QUESTION_MODEL,
    large: process.env.OPENROUTER_PENTESTGPT_PRO_MODEL,
    reasoning: process.env.REASONING_MODEL
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
