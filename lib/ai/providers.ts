import {
  customProvider,
  wrapLanguageModel,
  extractReasoningMiddleware,
} from 'ai';
import { mistral } from '@ai-sdk/mistral';
import { openai } from '@ai-sdk/openai';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { perplexity } from '@ai-sdk/perplexity';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': mistral('mistral-small-latest'),
    'chat-model-large': openrouter('deepseek/deepseek-chat-v3-0324'),
    'chat-model-gpt-small': openai('gpt-4o-mini'),
    'chat-model-gpt-large': openai('gpt-4o-2024-11-20', {
      parallelToolCalls: false,
    }),
    'chat-model-agent': openai('gpt-4o-2024-11-20', {
      parallelToolCalls: false,
    }),
    'chat-model-reasoning': wrapLanguageModel({
      model: openrouter('deepseek/deepseek-r1'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    'deep-research': perplexity('sonar-deep-research'),
    'vision-model': mistral('mistral-small-latest'),
    'title-model': mistral('mistral-small-latest'),
    'standalone-question-model': mistral('mistral-small-latest'),
  },
});
