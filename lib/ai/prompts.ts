import endent from 'endent';
import {
  getPentestGPTInfo,
  systemPromptEnding,
} from '@/lib/models/llm-prompting';
import { PENTESTGPT_AGENT_SYSTEM_PROMPT } from '../models/agent-prompts';
import { Geo } from '@vercel/functions';

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
  'chat-model-small': `${getPentestGPTInfo('Small Model', 'June 2024', false, false)}${systemPromptEnding}`,
  'chat-model-large': `${getPentestGPTInfo('Large Model', 'June 2024', false, false)}${systemPromptEnding}`,
  'chat-model-reasoning': `${getPentestGPTInfo('Reasoning Model', 'Octrober 2024', false, false)}${systemPromptEnding}`,
  'chat-model-agent': `${PENTESTGPT_AGENT_SYSTEM_PROMPT}`,
  'deep-research-model': `${getPentestGPTInfo('Deep Research', 'June 2024', false, false)}${systemPromptEnding}`,
  'web-search-model': `${getPentestGPTInfo('Web Search Model', 'June 2024', true, false)}${systemPromptEnding}`,
  'image-gen-model': `${getPentestGPTInfo('Image Generation Model', 'June 2024', false, true)}${systemPromptEnding}`,
};

export const getSystemPrompt = ({
  selectedChatModel,
  profileContext,
  userLocation,
}: {
  selectedChatModel: string;
  profileContext?: string;
  userLocation?: Geo & { timezone?: string };
}): string => {
  let basePrompt = modelPromptMap[selectedChatModel];

  // For web-search-model, update the prompt with location info
  if (selectedChatModel === 'web-search-model') {
    basePrompt = `${getPentestGPTInfo('Web Search Model', 'June 2024', true, false, userLocation)}${systemPromptEnding}`;
  }

  // For image-gen-model, update the prompt with image generation info
  if (selectedChatModel === 'image-gen-model') {
    basePrompt = `${getPentestGPTInfo('Image Generation Model', 'June 2024', false, true, userLocation)}${systemPromptEnding}`;
  }

  return buildSystemPrompt(basePrompt, profileContext);
};

export const DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE = (
  message: string,
) => `### Task:
You are a helpful assistant that generates short, concise chat titles based on the first user message.

### Instructions:
1. Generate a short title (3-5 words) based on the user's first message
2. Use the chatName tool to generate the title
3. Use the chat's primary language (default to English if multilingual)

### User Message:
${message}`;
