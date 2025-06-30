import { toVercelChatMessages } from '@/lib/ai/message-utils';
import {
  generateTitleFromUserMessage,
  handleFinalChatAndAssistantMessage,
} from '@/lib/ai/actions';
import { streamText, tool } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { DEEPRESEARCH_SYSTEM_PROMPT } from '@/lib/models/deepresearch-prompt';
import { executeDeepResearchTool } from './deep-research';
import type { DeepResearchConfig } from './deep-research';

// Function to handle research kickoff with chat-model-large
export async function handleResearchKickoff({
  config,
}: {
  config: DeepResearchConfig;
}) {
  const {
    messages,
    dataStream,
    abortSignal,
    chatMetadata,
    chat,
    originalMessages,
  } = config;

  let generatedTitle: string | undefined;
  let titleGenerationPromise: Promise<void> | null = null;

  // Start title generation if needed
  if (chatMetadata.id && !chat) {
    titleGenerationPromise = (async () => {
      generatedTitle = await generateTitleFromUserMessage({
        messages: originalMessages,
        abortSignal,
      });
      dataStream.writeData({ chatTitle: generatedTitle });
    })();
  }

  const assistantMessageId = uuidv4();

  try {
    const result = streamText({
      model: myProvider.languageModel('chat-model-large'),
      providerOptions: {
        openai: {
          store: false,
          parallelToolCalls: false,
        },
      },
      system: DEEPRESEARCH_SYSTEM_PROMPT,
      messages: toVercelChatMessages(messages),
      maxTokens: 512,
      abortSignal,
      tools: {
        research_kickoff_tool: tool({
          description:
            'Tool for managing research tasks - either clarifying requirements or starting research',
          parameters: z.object({
            clarify_with_text: z
              .string()
              .nullable()
              .describe(
                'Text to clarify requirements with the user before starting research',
              ),
            start_research_task: z
              .boolean()
              .nullable()
              .describe('Whether to start the actual research task'),
          }),
          execute: async ({ clarify_with_text }) => {
            if (clarify_with_text && clarify_with_text !== null) {
              dataStream.writeData({
                type: 'text-delta',
                content: clarify_with_text,
              });
              return {
                type: 'clarification',
                message: clarify_with_text,
              };
            }

            return {
              type: 'research_started',
              message: 'Starting deep research task...',
            };
          },
        }),
      },
      // Force tool choice to research_kickoff_tool
      toolChoice: { type: 'tool', toolName: 'research_kickoff_tool' },
      experimental_generateMessageId: () => assistantMessageId,
      onError: async (error) => {
        console.error('[ResearchKickoff] Stream Error:', error);
      },
      onFinish: async ({ toolCalls, text }) => {
        const kickoffTool = toolCalls?.find(
          (call) => call.toolName === 'research_kickoff_tool',
        );
        const shouldStartResearch = kickoffTool?.args.start_research_task;

        if (shouldStartResearch) {
          await executeDeepResearchTool({
            config: {
              ...config,
              generatedTitle,
              titleGenerationPromise,
              assistantMessageId,
            },
          });
        } else {
          // Save clarification message
          await Promise.all([
            titleGenerationPromise,
            config.initialChatPromise,
          ]);

          const assistantMessage =
            kickoffTool?.args.clarify_with_text || text || '';

          await handleFinalChatAndAssistantMessage({
            ...config,
            finishReason: 'stop',
            title: generatedTitle,
            assistantMessage,
            citations: [],
            thinkingText: undefined,
            thinkingElapsedSecs: null,
            assistantMessageId,
          });
        }
      },
    });

    result.mergeIntoDataStream(dataStream);

    return 'Research kickoff handled';
  } catch (error) {
    console.error('[ResearchKickoff] Error:', error);
    throw error;
  }
}
