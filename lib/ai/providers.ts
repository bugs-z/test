import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': openai.responses('gpt-4.1-mini-2025-04-14'),
    'chat-model-large': openai.responses('gpt-4.1-2025-04-14'),
    'chat-model-agent': openai('gpt-4.1-2025-04-14', {
      parallelToolCalls: false,
    }),
    'browser-model': openai.responses('gpt-4.1-mini-2025-04-14'),
    'chat-model-reasoning': wrapLanguageModel({
      model: xai('grok-3-mini-latest'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
  },
});
