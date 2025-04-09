import { generateStandaloneQuestion } from '@/lib/models/question-generator';
import { buildSystemPrompt, RAG_SYSTEM_PROMPT_BODY } from '@/lib/ai/prompts';
import PostHogClient from '@/app/posthog';

interface RagResult {
  ragUsed: boolean;
  ragId: string | null;
  systemPrompt: string | null;
}

interface RagChunk {
  text: string;
  score: number;
  id: string;
  index: number;
  metadata: Record<string, any>;
  document_id: string;
  document_name: string;
  document_metadata: Record<string, any>;
  links: Record<string, any>;
}

interface RagResponse {
  scored_chunks: RagChunk[];
}

export async function processRag({
  messages,
  isContinuation,
  profile,
  selectedChatModel,
}: {
  messages: any;
  isContinuation: boolean;
  profile: any;
  selectedChatModel: string;
}): Promise<RagResult> {
  const result: RagResult = {
    ragUsed: false,
    ragId: null,
    systemPrompt: null,
  };

  const targetStandAloneMessage = messages[messages.length - 1].content;
  const filterTargetMessage = isContinuation
    ? messages[messages.length - 2]
    : messages[messages.length - 1];

  const RAGIE_API_KEY = process.env.RAGIE_API_KEY;

  if (
    !RAGIE_API_KEY ||
    messages.length === 0 ||
    filterTargetMessage.role !== 'user' ||
    filterTargetMessage.content.length <= 5
  ) {
    return result;
  }

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'enhanced_search_executed',
    });
  }

  const { standaloneQuestion } = await generateStandaloneQuestion(
    messages,
    targetStandAloneMessage,
  );

  const response = await fetch('https://api.ragie.ai/retrievals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RAGIE_API_KEY}`,
    },
    body: JSON.stringify({
      query: standaloneQuestion,
      partition: 'test',
    }),
  });

  const data = (await response.json()) as RagResponse;

  if (
    data?.scored_chunks &&
    Array.isArray(data.scored_chunks) &&
    data.scored_chunks.length > 0
  ) {
    // Filter out chunks with score lower than 0.1
    const filteredChunks = data.scored_chunks.filter(
      (chunk) => chunk.score >= 0.08,
    );

    // If no chunks remain after filtering, return early
    if (filteredChunks.length === 0) {
      return result;
    }

    // Combine the text from all chunks
    const ragContent = filteredChunks
      .map((chunk) => chunk.text)
      .join('\n\n---\n\n');

    if (ragContent) {
      result.ragUsed = true;
      const ragPrompt = RAG_SYSTEM_PROMPT_BODY(selectedChatModel, ragContent);
      result.systemPrompt = buildSystemPrompt(
        ragPrompt,
        profile.profile_context,
      );
      // Use the ID of the first (highest scoring) chunk
      result.ragId = filteredChunks[0].id;
    }
  }

  return result;
}
