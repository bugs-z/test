import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { deepseek } from '@ai-sdk/deepseek';
import { openrouter } from '@openrouter/ai-sdk-provider';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': openai.responses('gpt-5-mini-2025-08-07'),
    'chat-model-small-text': deepseek('deepseek-chat'),
    'chat-model-large': openai.responses('gpt-5-2025-08-07'),
    'chat-model-large-text': openrouter('qwen/qwen3-coder'),
    'chat-model-reasoning': wrapLanguageModel({
      model: deepseek('deepseek-reasoner'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
  },
});
