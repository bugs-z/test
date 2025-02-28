import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/build-prompt"
import llmConfig from "@/lib/models/llm/llm-config"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText } from "ai"
interface BrowserToolConfig {
  chatSettings: any
  profile: any
  messages: any[]
  dataStream: any
}

export function getLastUserMessage(messages: any[]): string {
  return (
    messages.findLast(msg => msg.role === "user")?.content || "Unknown query"
  )
}

export async function browsePage(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`
  const jinaToken = process.env.JINA_API_TOKEN

  if (!jinaToken) {
    console.error("JINA_API_TOKEN is not set in the environment variables")
    throw new Error("JINA_API_TOKEN is not set in the environment variables")
  }

  try {
    const response = await fetch(jinaUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jinaToken}`,
        "X-With-Generated-Alt": "true",
        "X-No-Cache": "true",
        "X-With-Images-Summary": "true",
        "X-With-Links-Summary": "true"
      }
    })

    if (!response.ok) {
      console.error(`Error fetching URL: ${url}. Status: ${response.status}`)
      return `No content could be retrieved from the URL: ${url}. The webpage might be empty, unavailable, or there could be an issue with the content retrieval process. HTTP status: ${response.status}`
    }

    const content = await response.text()

    if (!content) {
      console.error(`Empty content received from URL: ${url}`)
      return `No content could be retrieved from the URL: ${url}. The webpage might be empty, unavailable, or there could be an issue with the content retrieval process.`
    }

    return content
  } catch (error) {
    console.error("Error browsing URL:", url, error)
    return `No content could be retrieved from the URL: ${url}. The webpage might be empty, unavailable, or there could be an issue with the content retrieval process.`
  }
}

export async function browseMultiplePages(
  urls: string[]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {}

  // Process up to 3 URLs
  const urlsToProcess = urls.slice(0, 3)

  // Process URLs in parallel
  await Promise.all(
    urlsToProcess.map(async url => {
      try {
        const content = await browsePage(url)
        results[url] = content
      } catch (error) {
        console.error(`Error browsing URL: ${url}`, error)
        results[url] =
          `No content could be retrieved from the URL: ${url}. The webpage might be empty, unavailable, or there could be an issue with the content retrieval process.`
      }
    })
  )

  return results
}

export function createBrowserPrompt(
  browserResult: string,
  lastUserMessage: string,
  url: string
): string {
  return `You have just browsed a webpage. The content you found is enclosed below:

<webpage>
<source>${url}</source>
<webpage_content>${browserResult}</webpage_content>
</webpage>

The user has the following query about this webpage:

<user_query>
${lastUserMessage}
</user_query>

With the information from the webpage content above, \
respond to the user's query as if you have comprehensive knowledge of the page. \
Provide a direct and insightful answer to the query. \
If the specific details are not present, draw upon related information to \
offer valuable insights or suggest practical alternatives. \
If the webpage content is empty, irrelevant, or indicates an error, \
clearly state that you couldn't access the information and explain why.

Important: Do not refer to "the webpage content provided" or "the information given" in your response. \
Instead, answer as if you have directly attempted to view the webpage and are sharing your experience with it.`
}

export function createMultiBrowserPrompt(
  browserResults: Record<string, string>,
  lastUserMessage: string
): string {
  const webpageContentSections = Object.entries(browserResults)
    .map(
      ([url, content]) => `<webpage>
<source>${url}</source>
<webpage_content>${content}</webpage_content>
</webpage>`
    )
    .join("\n\n")

  return `You have just browsed multiple webpages. The content you found is enclosed below:

${webpageContentSections}

The user has the following query about these webpages:

<user_query>
${lastUserMessage}
</user_query>

With the information from the webpage contents above, \
respond to the user's query as if you have comprehensive knowledge of the pages. \
Provide a direct and insightful answer to the query. \
If the specific details are not present, draw upon related information to \
offer valuable insights or suggest practical alternatives. \
If any webpage content is empty, irrelevant, or indicates an error, \
clearly state that you couldn't access the information and explain why.

Important: Do not refer to "the webpage content provided" or "the information given" in your response. \
Instead, answer as if you have directly attempted to view the webpages and are sharing your experience with them.`
}

export async function executeBrowserTool({
  open_url,
  config
}: {
  open_url: string | string[]
  config: BrowserToolConfig
}) {
  if (!process.env.JINA_API_TOKEN) {
    throw new Error("JINA_API_TOKEN environment variable is not set")
  }

  const { profile, messages, dataStream } = config
  // const { selectedModel } = await getProviderConfig(chatSettings)
  const selectedModel = "gpt-4o-mini"

  const lastUserMessage = getLastUserMessage(messages)
  let browserPrompt: string

  // Handle single URL or multiple URLs
  if (typeof open_url === "string") {
    const browserResult = await browsePage(open_url)
    browserPrompt = createBrowserPrompt(browserResult, lastUserMessage, open_url)
  } else {
    const browserResults = await browseMultiplePages(open_url)
    browserPrompt = createMultiBrowserPrompt(browserResults, lastUserMessage)
  }

  const openai = createOpenAI()

  console.log("[BrowserTool] Executing browser tool with model:", selectedModel)

  const { fullStream } = streamText({
    model: openai(selectedModel),
    system: buildSystemPrompt(
      llmConfig.systemPrompts.pentestGPTBrowser,
      profile.profile_context
    ),
    messages: [
      ...toVercelChatMessages(messages.slice(0, -1)),
      { role: "user", content: browserPrompt }
    ],
    maxTokens: 2048
  })

  for await (const delta of fullStream) {
    if (delta.type === "text-delta") {
      dataStream.writeData({
        type: "text-delta",
        content: delta.textDelta
      })
    }
  }

  return "Browser tool executed"
}
