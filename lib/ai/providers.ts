import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { deepseek } from '@ai-sdk/deepseek';
import { xai } from '@ai-sdk/xai';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': openai('gpt-4.1-mini-2025-04-14'),
    'chat-model-large': openai('gpt-4.1-2025-04-14'),
    'chat-model-small-with-tools': deepseek('deepseek-chat'),
    'chat-model-large-with-tools': xai('grok-3-latest'),
    'chat-model-vision': xai('grok-2-vision-latest'),
    'chat-model-agent': openai('gpt-4.1-2025-04-14', {
      parallelToolCalls: false,
    }),
    'browser-model': deepseek('deepseek-chat'),
    'chat-model-reasoning': wrapLanguageModel({
      model: xai('grok-3-mini-latest'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    'deep-research-model': wrapLanguageModel({
      model: perplexity('sonar-deep-research'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
  },
});
