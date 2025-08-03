import PostHogClient from '@/app/posthog';
import type { ChatMetadata, LLMID, ModelParams } from '@/types';
import { handleFinalChatAndAssistantMessage } from '@/lib/ai/actions';
import { v4 as uuidv4 } from 'uuid';
import type { Doc } from '@/convex/_generated/dataModel';
import OpenAI from 'openai';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';

export interface DeepResearchConfig {
  chat: Doc<'chats'> | null;
  messages: any[];
  profile: any;
  dataStream: any;
  modelParams: ModelParams;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  originalMessages: any[];
  systemPrompt: string;
  initialChatPromise: Promise<void>;
  generatedTitle?: string;
  titleGenerationPromise?: Promise<void> | null;
  assistantMessageId?: string;
}

/**
 * Convert messages to the format expected by OpenAI's deep research API
 */
function convertMessagesToDeepResearchFormat(messages: any[]): any[] {
  return messages.map((message) => {
    // Use output_text for assistant messages, input_text for others
    const textType =
      message.role === 'assistant' ? 'output_text' : 'input_text';

    const content = Array.isArray(message.content)
      ? message.content.map((item: any) => {
          if (item.type === 'text') {
            return { type: textType, text: item.text };
          }
          if (item.type === 'image_url') {
            return { type: 'input_image', image_url: item.image_url.url };
          }
          if (item.type === 'file') {
            // Convert file objects to input_file format for deep research
            // Convert Buffer to base64 data URL
            const base64Data = Buffer.isBuffer(item.data)
              ? item.data.toString('base64')
              : item.data;
            const dataUrl = `data:${item.mimeType};base64,${base64Data}`;

            return {
              type: 'input_file',
              file_data: dataUrl,
              filename: item.filename,
            };
          }
          return { type: textType, text: String(item.text || item) };
        })
      : [{ type: textType, text: String(message.content) }];

    return { role: message.role, content };
  });
}

export async function executeDeepResearchTool({
  config,
}: {
  config: DeepResearchConfig;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not set for deep research');
  }

  const {
    chat,
    messages,
    profile,
    dataStream,
    modelParams,
    chatMetadata,
    abortSignal,
    model,
    systemPrompt,
    initialChatPromise,
    generatedTitle,
    titleGenerationPromise,
    assistantMessageId: passedAssistantMessageId,
  } = config;

  // Check deep-research rate limit before starting actual deep research
  const deepResearchRateLimit = await checkRatelimitOnApi(
    profile.user_id,
    'deep-research',
  );

  if (!deepResearchRateLimit.allowed) {
    // Send rate limit error to the data stream
    dataStream.writeData({
      type: 'error',
      content: {
        type: 'ratelimit_hit',
        message: deepResearchRateLimit.info.message,
        isPremiumUser: deepResearchRateLimit.info.isPremiumUser,
      },
    });
    throw new Error(
      `Deep research rate limit exceeded: ${deepResearchRateLimit.info.message}`,
    );
  }

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'deep_research_executed',
    });
  }

  dataStream.writeData({
    type: 'tool-call',
    content: 'deep-research',
  });

  const citations: string[] = [];
  let isThinking = false;
  let thinkingStartTime: number | null = null;
  const assistantMessageId = passedAssistantMessageId || uuidv4();
  let assistantMessage = '';
  let reasoning = '';

  abortSignal.addEventListener('abort', async () => {
    console.log('deep research request aborted');

    // Save the assistant message if we have content and chat context
    if (
      (assistantMessage.trim() || reasoning.trim()) &&
      (chat || chatMetadata.id)
    ) {
      try {
        // Wait for initial chat handling to complete if it's in progress
        await initialChatPromise;

        // Calculate thinking elapsed time if we were thinking
        let thinkingElapsedSecs = null;
        if (isThinking && thinkingStartTime) {
          thinkingElapsedSecs = Math.round(
            (Date.now() - thinkingStartTime) / 1000,
          );
        }

        await handleFinalChatAndAssistantMessage({
          modelParams,
          chatMetadata,
          profile,
          model,
          chat,
          finishReason: 'stop',
          title: generatedTitle,
          assistantMessage,
          citations,
          thinkingText: reasoning || undefined,
          thinkingElapsedSecs,
          assistantMessageId,
        });

        console.log('Deep research assistant message saved on abort');
      } catch (error) {
        console.error(
          'Failed to save deep research assistant message on abort:',
          error,
        );
      }
    }
  });

  try {
    const openai = new OpenAI({ timeout: 800 * 1000 }); // 800 seconds (13 min 20 sec)

    // Convert messages to the format expected by OpenAI's deep research API
    const convertedMessages = convertMessagesToDeepResearchFormat(messages);

    const stream = await openai.responses.create({
      model: 'o4-mini-deep-research',
      reasoning: {
        summary: 'auto',
      },
      stream: true,
      input: convertedMessages,
      instructions: systemPrompt,
      tools: [{ type: 'web_search_preview' }],
    });

    for await (const event of stream) {
      if (event.type === 'response.reasoning_summary_text.delta') {
        if (!isThinking) {
          isThinking = true;
          thinkingStartTime = Date.now();
        }
        reasoning += event.delta;
        dataStream.writeData({
          type: 'reasoning',
          content: event.delta,
        });
      } else if (event.type === 'response.output_text.delta') {
        assistantMessage += event.delta;
        dataStream.writeData({
          type: 'text-delta',
          content: event.delta,
        });
      } else if (event.type === 'response.reasoning_summary_part.added') {
        assistantMessage += '\n\n';
        dataStream.writeData({
          type: 'reasoning',
          content: '\n\n',
        });
      }
    }

    // Calculate thinking elapsed time
    let thinkingElapsedSecs = null;
    if (isThinking && thinkingStartTime) {
      isThinking = false;
      thinkingElapsedSecs = Math.round((Date.now() - thinkingStartTime) / 1000);
      dataStream.writeData({
        type: 'thinking-time',
        elapsed_secs: thinkingElapsedSecs,
      });
    }

    // Wait for both title generation and initial chat handling to complete
    await Promise.all([titleGenerationPromise, initialChatPromise]);

    await handleFinalChatAndAssistantMessage({
      modelParams,
      chatMetadata,
      profile,
      model,
      chat,
      finishReason: 'stop',
      title: generatedTitle,
      assistantMessage,
      citations,
      thinkingText: reasoning || undefined,
      thinkingElapsedSecs,
      assistantMessageId,
    });

    return 'Deep research completed';
  } catch (error) {
    if (!(error instanceof Error && error.message === 'terminated')) {
      console.error('[DeepResearch] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    throw error;
  }
}
