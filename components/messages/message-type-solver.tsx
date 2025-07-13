import type { Doc } from '@/convex/_generated/dataModel';
import { PluginID } from '@/types/plugins';
import type { FC } from 'react';
import { MessageMarkdown } from './message-markdown';
import { MessageContentRenderer } from './message-content-renderer';

interface MessageTypeResolverProps {
  message: Doc<'messages'>;
  isLastMessage: boolean;
  toolInUse: string;
}

export const allTerminalPlugins = [PluginID.TERMINAL, PluginID.PENTEST_AGENT];

export const MessageTypeResolver: FC<MessageTypeResolverProps> = ({
  message,
  isLastMessage,
  toolInUse,
}) => {
  const isPluginOutput =
    message.plugin !== null &&
    message.plugin !== PluginID.NONE.toString() &&
    message.role === 'assistant';

  // Check if this message has any special content (terminal, citations, web search, thinking)
  const hasSpecialContent =
    message.role === 'assistant' &&
    // Has thinking content
    (message.thinking_content ||
      // Has terminal-related plugins
      (isPluginOutput &&
        allTerminalPlugins.includes(message.plugin as PluginID)) ||
      allTerminalPlugins.includes(toolInUse as PluginID) ||
      // Has web search or citations
      message.plugin === PluginID.WEB_SEARCH ||
      toolInUse === PluginID.WEB_SEARCH ||
      message.citations?.length > 0);

  // Use unified component for any special content
  if (hasSpecialContent) {
    return (
      <MessageContentRenderer
        content={message.content}
        citations={message.citations || []}
        isAssistant={message.role === 'assistant'}
        isLastMessage={isLastMessage}
        thinking_content={message.thinking_content}
        thinking_elapsed_secs={message.thinking_elapsed_secs}
      />
    );
  }

  return (
    <MessageMarkdown
      content={message.content}
      isAssistant={message.role === 'assistant'}
    />
  );
};
