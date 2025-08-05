import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { deepseek } from '@ai-sdk/deepseek';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': openai.responses('gpt-4.1-mini-2025-04-14'),
    'chat-model-large': openai.responses('gpt-4.1-2025-04-14'),
    'browser-model': openai.responses('gpt-4.1-mini-2025-04-14'),
    'chat-model-reasoning': wrapLanguageModel({
      model: deepseek('deepseek-reasoner'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
  },
});
