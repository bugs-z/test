import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': openai('gpt-4.1-mini-2025-04-14'),
    'chat-model-large': openai('gpt-4.1-2025-04-14'),
    'chat-model-small-with-tools': openai('gpt-4.1-mini-2025-04-14', {
      parallelToolCalls: false,
    }),
    'chat-model-large-with-tools': openai('gpt-4.1-2025-04-14', {
      parallelToolCalls: false,
    }),
    'chat-model-agent': openai('gpt-4.1-2025-04-14', {
      parallelToolCalls: false,
    }),
    'browser-model': openai('gpt-4.1-mini-2025-04-14'),
    'chat-model-reasoning': wrapLanguageModel({
      model: xai('grok-3-mini-latest'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    'deep-research-model': openai.responses('o4-mini-deep-research-2025-06-26'),
  },
});
