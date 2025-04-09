// Only used in use-chat-handler.tsx to keep it clean

import type { AlertAction } from '@/context/alert-context';
import { createChat } from '@/db/chats';
import { buildFinalMessages } from '@/lib/build-prompt';
import type { Tables } from '@/supabase/types';
import {
  type ChatMessage,
  type ChatPayload,
  type ChatSettings,
  type LLM,
  type MessageImage,
  PluginID,
} from '@/types';
import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { processResponse } from './stream-processor';
import type { AgentStatusState } from '@/components/messages/agent-status';

export * from './create-messages';
export * from './create-temp-messages';
export * from './image-handlers';
export * from './validation';

export const handleHostedChat = async (
  payload: ChatPayload,
  tempAssistantChatMessage: ChatMessage,
  isRegeneration: boolean,
  isContinuation: boolean,
  isTerminalContinuation: boolean,
  newAbortController: AbortController,
  chatImages: MessageImage[],
  setIsGenerating: Dispatch<SetStateAction<boolean>>,
  setFirstTokenReceived: Dispatch<SetStateAction<boolean>>,
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  setToolInUse: Dispatch<SetStateAction<string>>,
  alertDispatch: Dispatch<AlertAction>,
  selectedPlugin: PluginID,
  setAgentStatus: Dispatch<SetStateAction<AgentStatusState | null>>,
) => {
  setToolInUse(
    selectedPlugin && selectedPlugin !== PluginID.NONE
      ? selectedPlugin
      : 'none',
  );

  const formattedMessages = await buildFinalMessages(payload, chatImages);

  const requestBody = {
    messages: formattedMessages,
    chatSettings: payload.chatSettings,
    isContinuation,
    selectedPlugin,
    isTerminalContinuation,
  };

  const chatResponse = await fetchChatResponse(
    requestBody,
    newAbortController,
    setIsGenerating,
    setChatMessages,
    alertDispatch,
  );

  const lastMessage =
    isRegeneration || isContinuation
      ? payload.chatMessages[
          payload.chatMessages.length - (isContinuation ? 2 : 1)
        ]
      : tempAssistantChatMessage;

  return processResponse(
    chatResponse,
    lastMessage,
    newAbortController,
    setFirstTokenReceived,
    setChatMessages,
    setToolInUse,
    requestBody,
    setIsGenerating,
    alertDispatch,
    selectedPlugin,
    isContinuation,
    setAgentStatus,
  );
};

export const fetchChatResponse = async (
  body: object,
  controller: AbortController,
  setIsGenerating: Dispatch<SetStateAction<boolean>>,
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  alertDispatch: Dispatch<AlertAction>,
) => {
  const response = await fetch(`/api/chat`, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!response.ok) {
    if (response.status === 500) {
      const errorData = await response.json();
      toast.error(errorData.message);
    }

    const errorData = await response.json();
    if (response.status === 429 && errorData && errorData.timeRemaining) {
      alertDispatch({
        type: 'SHOW',
        payload: {
          message: errorData.message,
          title: 'Usage Cap Error',
          ...(errorData.subscriptionType === 'free' && {
            action: {
              label: 'Upgrade Now',
              onClick: () => {
                window.location.href = '/upgrade';
              },
            },
          }),
        },
      });
    } else {
      const errorData = await response.json();
      toast.error(errorData.message);
    }

    setIsGenerating(false);
    setChatMessages((prevMessages) => prevMessages.slice(0, -2));
  }

  return response;
};

export const handleCreateChat = async (
  chatSettings: ChatSettings,
  profile: Tables<'profiles'>,
  messageContent: string,
  finishReason: string,
  setSelectedChat: Dispatch<SetStateAction<Tables<'chats'> | null>>,
  setChats: Dispatch<SetStateAction<Tables<'chats'>[]>>,
) => {
  // Create chat first with a temporary chat name
  const createdChat = await createChat({
    user_id: profile.user_id,
    include_profile_context: chatSettings.includeProfileContext,
    model: chatSettings.model,
    name: messageContent.substring(0, 100),
    finish_reason: finishReason,
  });

  setSelectedChat(createdChat);
  setChats((chats) => [createdChat, ...chats]);

  return createdChat;
};

export const generateChatTitle = async (
  messages: { message: { content: string; role: string } }[],
) => {
  try {
    const response = await fetch('/api/chat/generate-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.name || null;
  } catch (error) {
    console.error('Error generating chat name:', error);
    return null;
  }
};
