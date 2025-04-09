import endent from 'endent';
import {
  getPentestGPTInfo,
  systemPromptEnding,
} from '@/lib/models/llm-prompting';

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

export const systemPrompt = ({
  selectedChatModel,
  profileContext,
}: {
  selectedChatModel: string;
  profileContext?: string;
}): string => {
  const basePrompt = modelPromptMap[selectedChatModel];
  return buildSystemPrompt(basePrompt, profileContext);
};
