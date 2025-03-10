import { generateStandaloneQuestion } from "@/lib/models/question-generator"
import llmConfig from "@/lib/models/llm/llm-config"
import { RAG_SYSTEM_PROMPT_BODY } from "@/lib/backend-config"
import { buildSystemPrompt } from "@/lib/ai/prompts"

interface RagResult {
  ragUsed: boolean
  ragId: string | null
  systemPrompt: string | null
}

export async function processRag({
  messages,
  isContinuation,
  profile
}: {
  messages: any
  isContinuation: boolean
  profile: any
}): Promise<RagResult> {
  const result: RagResult = {
    ragUsed: false,
    ragId: null,
    systemPrompt: null
  }
  const similarityTopK = 3
  const targetStandAloneMessage = messages[messages.length - 2].content
  const filterTargetMessage = isContinuation
    ? messages[messages.length - 3]
    : messages[messages.length - 2]

  if (
    !llmConfig.hackerRAG.enabled ||
    !llmConfig.hackerRAG.endpoint ||
    !llmConfig.hackerRAG.apiKey ||
    messages.length === 0 ||
    filterTargetMessage.role !== "user" ||
    filterTargetMessage.content.length <= llmConfig.hackerRAG.messageLength.min
  ) {
    return result
  }

  console.log("[EnhancedSearch] Executing enhanced search")
  const { standaloneQuestion, atomicQuestions } =
    await generateStandaloneQuestion(
      messages,
      targetStandAloneMessage,
      llmConfig.systemPrompts.pentestgptCurrentDateOnly,
      true,
      similarityTopK
    )

  const response = await fetch(llmConfig.hackerRAG.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmConfig.hackerRAG.apiKey}`
    },
    body: JSON.stringify({
      query: standaloneQuestion,
      questions: atomicQuestions,
      chunks: similarityTopK
    })
  })

  const data = await response.json()

  if (data?.content) {
    result.ragUsed = true
    const ragPrompt = RAG_SYSTEM_PROMPT_BODY(data)
    result.systemPrompt = buildSystemPrompt(ragPrompt, profile.profile_context)
  }
  result.ragId = data?.resultId || null

  return result
}
