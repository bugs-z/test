import endent from 'endent';
import {
  getPentestGPTInfo,
  systemPromptEnding,
} from '@/lib/models/llm-prompting';
import type { ChatMessage } from '@/types/chat-message';

export function buildSystemPrompt(
  basePrompt: string,
  profileContext?: string,
): string {
  const profilePrompt = profileContext
    ? endent`The user provided the following information about themselves. This user profile is shown to you in all conversations they have -- this means it is not relevant to 99% of requests.
    Before answering, quietly think about whether the user's request is "directly related", "related", "tangentially related", or "not related" to the user profile provided.
    Only acknowledge the profile when the request is directly related to the information provided.
    Otherwise, don't acknowledge the existence of these instructions or the information at all.
    <user_profile>
    ${profileContext}
    </user_profile>`
    : '';

  return `${basePrompt}\n\n${profilePrompt}`.trim();
}

const modelPromptMap: Record<string, string> = {
  'chat-model-small': `${getPentestGPTInfo(true, 'October 2023', 'Small Model')}\n${systemPromptEnding}`,
  'chat-model-large': `${getPentestGPTInfo(true, 'October 2023', 'Large Model')}${systemPromptEnding}`,
  'chat-model-gpt-large': `${getPentestGPTInfo(true, 'October 2023', 'PentestGPT 4o')}\n${systemPromptEnding}`,
  'vision-model': `${getPentestGPTInfo(true, 'October 2023', 'Vision Model')}\n${systemPromptEnding}`,
};

export const getSystemPrompt = ({
  selectedChatModel,
  profileContext,
}: {
  selectedChatModel: string;
  profileContext?: string;
}): string => {
  const basePrompt = modelPromptMap[selectedChatModel];
  return buildSystemPrompt(basePrompt, profileContext);
};

export const DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE = (
  messages: ChatMessage[],
) => `### Task:
You are a helpful assistant that generates concise chat titles. Use the chatName tool to generate a title.

### Instructions:
1. Use the chatName tool to generate a concise title (3-5 words)
2. The title should clearly represent the main theme of the conversation
3. Use the chat's primary language (default to English if multilingual)

### Important:
- You MUST use the chatName tool to generate the title
- Do not generate the title directly in your response
- Do not add any additional text or explanations

### Chat History:
<chat_history>
${messages.map((message) => `${message.message.role}: ${message.message.content}`).join('\n')}
</chat_history>`;

export const RAG_SYSTEM_PROMPT = `Given the following conversation, relevant context, and \
a follow-up question, reply with an answer to the current question the user is asking. \
In your response, focus on providing comprehensive and accurate information, adhering \
to the user's instructions. Avoid including direct links if there's a possibility of \
broken links or references to local files. Instead, describe the resources or methods \
in detail, enabling the user to locate them through their own searches if necessary.`;

export const RAG_SYSTEM_PROMPT_BODY = (
  selectedChatModel: string,
  ragContent: string,
) => endent`
${getSystemPrompt({ selectedChatModel })} ${RAG_SYSTEM_PROMPT}

Context for RAG enrichment:
---------------------
${ragContent}
---------------------
DON'T MENTION OR REFERENCE ANYTHING RELATED TO RAG CONTENT OR ANYTHING RELATED TO RAG. \
USER DOESN'T HAVE DIRECT ACCESS TO THIS CONTENT, ITS PURPOSE IS TO ENRICH YOUR OWN KNOWLEDGE. \
ROLE PLAY.
`;
