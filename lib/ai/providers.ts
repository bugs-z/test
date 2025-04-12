import {
  customProvider,
  wrapLanguageModel,
  extractReasoningMiddleware,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { perplexity } from '@ai-sdk/perplexity';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': openrouter('mistralai/mistral-small-3.1-24b-instruct', {
      extraBody: {
        provider: {
          order: ['Mistral'],
        },
      },
    }),
    'chat-model-large': openrouter('x-ai/grok-3-beta'),
    'chat-model-gpt-small': openai('gpt-4o-mini'),
    'chat-model-gpt-large': openai('gpt-4o-2024-11-20'),
    'chat-model-gpt-large-with-tools': openai('gpt-4o-2024-11-20', {
      parallelToolCalls: false,
    }),
    'chat-model-agent': openai('gpt-4o-2024-11-20', {
      parallelToolCalls: false,
    }),
    'chat-model-reasoning': wrapLanguageModel({
      model: openrouter('x-ai/grok-3-mini-beta', {
        extraBody: {
          reasoning: { effort: 'high' },
        },
      }),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    'deep-research': perplexity('sonar-deep-research'),
    'vision-model': openrouter('mistralai/mistral-small-3.1-24b-instruct', {
      extraBody: {
        provider: {
          order: ['Mistral'],
        },
      },
    }),
  },
});
