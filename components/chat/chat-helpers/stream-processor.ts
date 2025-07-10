import type {
  ChatMessage,
  DataPartValue,
  FileAttachment,
  MessageImage,
} from '@/types';
import type { AlertAction } from '@/context/alert-context';
import { processDataStream } from 'ai';
import { toast } from 'sonner';
import { PluginID } from '@/types/plugins';
import type { AgentStatusState } from '@/components/messages/agent-status';
import type { Dispatch, SetStateAction } from 'react';
import { fetchChatResponse } from '.';

export const processResponse = async (
  response: Response,
  lastChatMessage: ChatMessage,
  controller: AbortController,
  setFirstTokenReceived: Dispatch<SetStateAction<boolean>>,
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  setToolInUse: Dispatch<SetStateAction<string>>,
  setIsGenerating: Dispatch<SetStateAction<boolean>>,
  alertDispatch: Dispatch<AlertAction>,
  selectedPlugin: PluginID,
  isContinuation: boolean,
  setAgentStatus: Dispatch<SetStateAction<AgentStatusState | null>>,
  requestBody: any,
  setChatImages: Dispatch<SetStateAction<MessageImage[]>>,
) => {
  if (!response.ok) {
    const result = await response.json();
    let errorMessage = result.error?.message || 'An unknown error occurred';

    switch (response.status) {
      case 400:
        errorMessage = `Bad Request: ${errorMessage}`;
        break;
      case 401:
        errorMessage = `Invalid Credentials: ${errorMessage}`;
        break;
      case 402:
        errorMessage = `Out of Credits: ${errorMessage}`;
        break;
      case 403:
        errorMessage = `Moderation Required: ${errorMessage}`;
        break;
      case 408:
        errorMessage = `Request Timeout: ${errorMessage}`;
        break;
      case 429:
        errorMessage = `Rate Limited: ${errorMessage}`;
        break;
      case 502:
        errorMessage = `Service Unavailable: ${errorMessage}`;
        break;
      default:
        errorMessage = `HTTP Error: ${errorMessage}`;
    }

    throw new Error(errorMessage);
  }

  if (response.body) {
    let fullText = '';
    let thinkingText = '';
    let finishReason = '';
    let thinkingElapsedSecs: number | null = null;
    let isFirstChunk = true;
    let isFirstChunkReceived = false;
    let updatedPlugin = selectedPlugin;
    let toolExecuted = false;
    let citations: string[] = [];
    let shouldSkipFirstChunk = false;
    let chatTitle: string | null = null;
    let fileAttachments: FileAttachment[] = [];
    let assistantMessageId: string | null = null;
    let assistantImageUrls: string[] = [];

    try {
      await processDataStream({
        stream: response.body,
        onTextPart: (value) => {
          if (value && !controller.signal.aborted) {
            // Check if this is the first chunk and matches the last message
            if (isFirstChunk) {
              isFirstChunkReceived = true;
              if (
                isContinuation &&
                lastChatMessage?.message?.content === value
              ) {
                shouldSkipFirstChunk = true;
                isFirstChunk = false;
                return;
              }
              setFirstTokenReceived(true);
              isFirstChunk = false;
            }

            // Skip if this was a duplicate first chunk
            if (shouldSkipFirstChunk) {
              shouldSkipFirstChunk = false;
              return;
            }

            fullText += value;

            setChatMessages((prev) =>
              prev.map((chatMessage) =>
                chatMessage.message.id === lastChatMessage.message.id
                  ? {
                      ...chatMessage,
                      message: {
                        ...chatMessage.message,
                        content: chatMessage.message.content + value,
                      },
                    }
                  : chatMessage,
              ),
            );
          }
        },
        onDataPart: (value) => {
          if (
            Array.isArray(value) &&
            value.length > 0 &&
            !controller.signal.aborted
          ) {
            const firstValue = value[0] as DataPartValue;

            if (firstValue.type) {
              if (firstValue.type === 'text-delta') {
                // Check if this is the first chunk and matches the last message
                if (isFirstChunk) {
                  isFirstChunkReceived = true;
                  if (
                    isContinuation &&
                    lastChatMessage?.message?.content === firstValue.content
                  ) {
                    shouldSkipFirstChunk = true;
                    isFirstChunk = false;
                    return;
                  }
                  setFirstTokenReceived(true);
                  isFirstChunk = false;
                }

                // Skip if this was a duplicate first chunk
                if (shouldSkipFirstChunk) {
                  shouldSkipFirstChunk = false;
                  return;
                }

                fullText += firstValue.content;

                setChatMessages((prev) =>
                  prev.map((chatMessage) =>
                    chatMessage.message.id === lastChatMessage.message.id
                      ? {
                          ...chatMessage,
                          message: {
                            ...chatMessage.message,
                            content:
                              chatMessage.message.content + firstValue.content,
                          },
                        }
                      : chatMessage,
                  ),
                );
              }

              if (firstValue.type === 'file-attachment') {
                const attachments = Array.isArray(firstValue.content)
                  ? (firstValue.content as FileAttachment[])
                  : [];
                fileAttachments = [...fileAttachments, ...attachments];
              }

              if (firstValue.type === 'assistant-images') {
                const imageUrls = Array.isArray(firstValue.content)
                  ? (firstValue.content as string[])
                  : [];
                assistantImageUrls = [...assistantImageUrls, ...imageUrls];

                // Add assistant images to chatImages state
                const newAssistantImages = imageUrls.map((url) => ({
                  messageId: lastChatMessage.message.id,
                  path: url,
                  url: url,
                  file: null,
                }));

                setChatImages((prevImages) => [
                  ...prevImages,
                  ...newAssistantImages,
                ]);
              }

              if (firstValue.type === 'agent-status') {
                setAgentStatus(firstValue.content as AgentStatusState);
              }

              if (firstValue.type === 'reasoning') {
                if (isFirstChunk) {
                  setFirstTokenReceived(true);
                  isFirstChunk = false;
                }

                thinkingText += firstValue.content;

                setChatMessages((prev) =>
                  prev.map((chatMessage) =>
                    chatMessage.message.id === lastChatMessage.message.id
                      ? {
                          ...chatMessage,
                          message: {
                            ...chatMessage.message,
                            thinking_content: thinkingText,
                          },
                        }
                      : chatMessage,
                  ),
                );
              }

              // Handle thinking time
              if (
                firstValue.type === 'thinking-time' &&
                firstValue.elapsed_secs
              ) {
                thinkingElapsedSecs = firstValue.elapsed_secs;
                setChatMessages((prev) =>
                  prev.map((chatMessage) =>
                    chatMessage.message.id === lastChatMessage.message.id
                      ? {
                          ...chatMessage,
                          message: {
                            ...chatMessage.message,
                            thinking_elapsed_secs:
                              thinkingElapsedSecs || undefined,
                          },
                        }
                      : chatMessage,
                  ),
                );
              }

              // Handle tools errors
              if (firstValue.type === 'error') {
                let errorMessage = 'An unknown error occurred';

                // Handle both string and object error content
                if (typeof firstValue.content === 'string') {
                  errorMessage = firstValue.content;
                } else if (
                  typeof firstValue.content === 'object' &&
                  firstValue.content !== null
                ) {
                  const errorContent = firstValue.content as any;
                  if (errorContent.message) {
                    errorMessage = errorContent.message;
                  } else {
                    // Fallback for other object structures
                    errorMessage = JSON.stringify(firstValue.content);
                  }
                }

                if (
                  errorMessage.includes('reached the limit') ||
                  errorMessage.includes('rate limit')
                ) {
                  alertDispatch({
                    type: 'SHOW',
                    payload: {
                      message: errorMessage,
                      title: 'Usage Cap Error',
                    },
                  });
                } else {
                  toast.error(errorMessage);
                }

                setIsGenerating(false);
                controller.abort();
                return;
              }
            }

            // Handle citations - accumulate them one by one
            if (firstValue?.citations) {
              // Add new citations to existing ones (avoiding duplicates)
              const newCitations = Array.isArray(firstValue.citations)
                ? firstValue.citations
                : [firstValue.citations];

              newCitations.forEach((citation) => {
                if (!citations.includes(citation)) {
                  citations.push(citation);
                }
              });
            }

            // Handle chatTitle
            if (firstValue?.chatTitle) {
              chatTitle = firstValue.chatTitle;
            }

            if (firstValue?.messageId) {
              assistantMessageId = firstValue.messageId;
            }

            // Handle finishReason
            if (firstValue?.finishReason) {
              if (firstValue.finishReason === 'tool-calls') {
                finishReason = 'terminal-calls';
              } else {
                finishReason = firstValue.finishReason;
              }
            }
          }
        },
        onToolCallPart: async (value) => {
          if (toolExecuted || controller.signal.aborted) return;

          const { toolName } = value;
          const toolMap = {
            browser: PluginID.BROWSER,
            run_terminal_cmd: PluginID.TERMINAL,
            webSearch: PluginID.WEB_SEARCH,
            image_gen: PluginID.IMAGE_GEN,
          } as const;

          const plugin = toolMap[toolName as keyof typeof toolMap];
          if (plugin) {
            setToolInUse(plugin);
            updatedPlugin = plugin;
          }

          toolExecuted = true;
        },
        onStartStepPart: (value) => {
          if (value.messageId) {
            assistantMessageId = value.messageId;
          }
        },
        onReasoningPart: (value) => {
          if (isFirstChunk) {
            setFirstTokenReceived(true);
            isFirstChunk = false;
          }

          thinkingText += value;

          setChatMessages((prev) =>
            prev.map((chatMessage) =>
              chatMessage.message.id === lastChatMessage.message.id
                ? {
                    ...chatMessage,
                    message: {
                      ...chatMessage.message,
                      thinking_content: thinkingText,
                    },
                  }
                : chatMessage,
            ),
          );
        },
        onFinishMessagePart: (value) => {
          if (finishReason === '' && !controller.signal.aborted) {
            // Only set finishReason if it hasn't been set before
            if (
              value.finishReason === 'tool-calls' &&
              (updatedPlugin === PluginID.PENTEST_AGENT ||
                updatedPlugin === PluginID.TERMINAL)
            ) {
              // To use continue generating for terminal
              finishReason = 'terminal-calls';
            } else if (
              value.finishReason === 'length' &&
              !isFirstChunkReceived &&
              isContinuation
            ) {
              finishReason = 'stop';
            } else {
              finishReason = value.finishReason;
            }
          }
        },
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Unexpected error processing stream:', error);
      }
    }

    return {
      fullText,
      thinkingText,
      thinkingElapsedSecs,
      finishReason,
      selectedPlugin: updatedPlugin,
      citations,
      chatTitle,
      fileAttachments,
      assistantMessageId,
      assistantImageUrls,
    };
  } else {
    throw new Error('Response body is null');
  }
};
