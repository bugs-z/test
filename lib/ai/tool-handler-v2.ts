import { PluginID } from '@/types/plugins';
import { executeWebSearchTool } from '@/lib/ai/tools/web-search';
import { executeTerminalAgent } from '@/lib/ai/tools/terminal-agent';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { executeReasoningWebSearchTool } from '@/lib/ai/tools/reasoning-web-search';
import { executeDeepResearchTool } from '@/lib/ai/tools/deep-research';
import { terminalPlugins } from '@/lib/ai/terminal-utils';
import { createStreamResponse } from '@/lib/ai-helper';
import { generateTitleFromUserMessage } from '@/lib/ai/actions';

interface ToolHandlerConfig {
  messages: any[];
  profile: any;
  isTerminalContinuation: boolean;
  selectedPlugin: PluginID;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
  chatMetadata?: { newChat: boolean };
  title: Promise<string>;
}

export async function handleToolExecution(config: ToolHandlerConfig) {
  const {
    messages,
    profile,
    isTerminalContinuation,
    selectedPlugin,
    isLargeModel,
    abortSignal,
    chatMetadata,
    title,
  } = config;

  if (isTerminalContinuation) {
    return createStreamResponse(async (dataStream) => {
      await Promise.all([
        executeTerminalAgent({
          config: {
            messages,
            profile,
            dataStream,
            abortSignal,
          },
        }),
        (async () => {
          if (chatMetadata?.newChat) {
            dataStream.writeData({ chatTitle: await title });
          }
        })(),
      ]);
    });
  }

  switch (selectedPlugin) {
    case PluginID.WEB_SEARCH:
      return createStreamResponse(async (dataStream) => {
        await Promise.all([
          executeWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel,
              directToolCall: true,
            },
          }),
          (async () => {
            if (chatMetadata?.newChat) {
              dataStream.writeData({ chatTitle: await title });
            }
          })(),
        ]);
      });

    case PluginID.TERMINAL:
      return createStreamResponse(async (dataStream) => {
        await Promise.all([
          executeTerminalAgent({
            config: {
              messages,
              profile,
              dataStream,
              abortSignal,
            },
          }),
          (async () => {
            if (chatMetadata?.newChat) {
              dataStream.writeData({ chatTitle: await title });
            }
          })(),
        ]);
      });

    case PluginID.REASONING:
      return createStreamResponse(async (dataStream) => {
        await Promise.all([
          executeReasonLLMTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel,
            },
          }),
          (async () => {
            if (chatMetadata?.newChat) {
              dataStream.writeData({ chatTitle: await title });
            }
          })(),
        ]);
      });

    case PluginID.REASONING_WEB_SEARCH:
      return createStreamResponse(async (dataStream) => {
        await Promise.all([
          executeReasoningWebSearchTool({
            config: {
              messages,
              profile,
              dataStream,
              isLargeModel,
            },
          }),
          (async () => {
            if (chatMetadata?.newChat) {
              dataStream.writeData({ chatTitle: await title });
            }
          })(),
        ]);
      });

    case PluginID.DEEP_RESEARCH:
      return createStreamResponse(async (dataStream) => {
        await Promise.all([
          executeDeepResearchTool({
            config: {
              messages,
              profile,
              dataStream,
            },
          }),
          (async () => {
            if (chatMetadata?.newChat) {
              dataStream.writeData({ chatTitle: await title });
            }
          })(),
        ]);
      });

    default:
      if (terminalPlugins.includes(selectedPlugin as PluginID)) {
        return createStreamResponse(async (dataStream) => {
          await Promise.all([
            executeTerminalAgent({
              config: {
                messages,
                profile,
                dataStream,
                selectedPlugin: selectedPlugin as PluginID,
                abortSignal,
              },
            }),
            (async () => {
              if (chatMetadata?.newChat) {
                dataStream.writeData({ chatTitle: await title });
              }
            })(),
          ]);
        });
      }
  }

  return null;
}
