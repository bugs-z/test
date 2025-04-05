import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MessageMarkdown } from '../message-markdown';
import {
  IconChevronDown,
  IconChevronUp,
  IconTerminal2,
} from '@tabler/icons-react';
import { PluginID } from '@/types/plugins';
import { MessageTooLong } from '../message-too-long';
import { terminalPlugins } from '../message-type-solver';
import { useUIContext } from '@/context/ui-context';

interface MessageTerminalProps {
  content: string;
  messageId?: string;
  isAssistant: boolean;
}

interface TerminalBlock {
  command: string;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ContentBlock {
  type: 'text' | 'terminal';
  content: string | TerminalBlock;
}

export const MessageTerminal: React.FC<MessageTerminalProps> = ({
  content,
  messageId,
  isAssistant,
}) => {
  const { showTerminalOutput, toolInUse } = useUIContext();
  const contentBlocks = useMemo(() => parseContent(content), [content]);

  const [closedBlocks, setClosedBlocks] = useState(() => new Set<number>());
  const [userInteracted, setUserInteracted] = useState(() => new Set<number>());

  useEffect(() => {
    setClosedBlocks((prev) => {
      const newSet = new Set(prev);
      contentBlocks.forEach((_, index) => {
        if (!userInteracted.has(index)) {
          if (!showTerminalOutput) {
            newSet.add(index);
          } else {
            newSet.delete(index);
          }
        }
      });
      return newSet;
    });
  }, [showTerminalOutput, contentBlocks, userInteracted]);

  const toggleBlock = useCallback((index: number) => {
    setUserInteracted((prev) => new Set(prev).add(index));
    setClosedBlocks((prev) => {
      const newSet = new Set(prev);
      newSet.has(index) ? newSet.delete(index) : newSet.add(index);
      return newSet;
    });
  }, []);

  const renderContent = (content: string) =>
    content.length > 12000 ? (
      <div className="mt-4">
        <MessageTooLong
          content={content}
          plugin={PluginID.TERMINAL}
          id={messageId || ''}
        />
      </div>
    ) : (
      <MessageMarkdown content={content} isAssistant={true} />
    );

  const renderTerminalBlock = useCallback(
    (block: TerminalBlock, index: number) => (
      <div className={`overflow-hidden ${index === 1 ? 'mb-3' : 'my-3'}`}>
        <button
          className="flex w-full items-center justify-between transition-colors duration-200"
          onClick={() => toggleBlock(index)}
          aria-expanded={!closedBlocks.has(index)}
          aria-controls={`terminal-content-${index}`}
        >
          <div
            className={`flex items-center ${contentBlocks.length - 1 === index && terminalPlugins.includes(toolInUse as PluginID) ? 'animate-pulse' : ''}`}
          >
            <IconTerminal2 size={20} />
            <h4 className="ml-2 mr-1 text-lg">Terminal</h4>
            {closedBlocks.has(index) ? (
              <IconChevronDown size={16} />
            ) : (
              <IconChevronUp size={16} />
            )}
          </div>
        </button>
        {!closedBlocks.has(index) && (
          <div
            id={`terminal-content-${index}`}
            className="max-h-[12000px] opacity-100 transition-all duration-300 ease-in-out"
          >
            <div className="mt-4">
              <MessageMarkdown
                content={
                  block.command.startsWith('<terminal-command')
                    ? block.command
                    : `\`\`\`terminal\n${block.command}\n\`\`\``
                }
                isAssistant={true}
              />
              {block.stdout && (
                <div className="mt-2">
                  {renderContent(`\`\`\`stdout\n${block.stdout}\n\`\`\``)}
                </div>
              )}
              {block.stderr && (
                <div className="mt-2">
                  {renderContent(`\`\`\`stderr\n${block.stderr}\n\`\`\``)}
                </div>
              )}
              {block.error && (
                <div className="mt-2 text-red-500">
                  {renderContent(`\`\`\`stderr\n${block.error}\n\`\`\``)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    ),
    [closedBlocks, contentBlocks, renderContent, toggleBlock, toolInUse],
  );

  return (
    <div>
      {contentBlocks.map((block, index) => (
        <React.Fragment key={index}>
          {block.type === 'text' ? (
            <MessageMarkdown
              content={block.content as string}
              isAssistant={isAssistant}
            />
          ) : (
            renderTerminalBlock(block.content as TerminalBlock, index)
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

const parseContent = (content: string): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  const blockRegex =
    /((?:<terminal-command[^>]*>[\s\S]*?<\/terminal-command>|```terminal\n[\s\S]*?```)(?:\n```(?:stdout|stderr)[\s\S]*?(?:```|$))*(?:\s*<terminal-error>[\s\S]*?<\/terminal-error>)?)/g;
  const terminalXmlRegex =
    /<terminal-command(?:\s+[^>]*)?>([\s\S]*?)<\/terminal-command>/;
  const terminalMarkdownRegex = /```terminal\n([\s\S]*?)```/;
  const stdoutRegex = /```stdout\n([\s\S]*?)(?:```|$)/;
  const stderrRegex = /```stderr\n([\s\S]*?)(?:```|$)/;
  const errorRegex = /<terminal-error>([\s\S]*?)<\/terminal-error>/;

  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: content.slice(lastIndex, match.index).trim(),
      });
    }

    const block = match[1];
    const terminalXmlMatch = block.match(terminalXmlRegex);
    const terminalMarkdownMatch = block.match(terminalMarkdownRegex);
    const stdoutMatch = block.match(stdoutRegex);
    const stderrMatch = block.match(stderrRegex);
    const errorMatch = block.match(errorRegex);

    if (terminalXmlMatch || terminalMarkdownMatch) {
      blocks.push({
        type: 'terminal',
        content: {
          command: (
            terminalXmlMatch?.[1] ||
            terminalMarkdownMatch?.[1] ||
            ''
          ).trim(),
          stdout: stdoutMatch ? stdoutMatch[1].trim() : '',
          stderr: stderrMatch ? stderrMatch[1].trim() : '',
          error: errorMatch ? errorMatch[1].trim() : undefined,
        },
      });
    }

    lastIndex = blockRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.slice(lastIndex).trim() });
  }

  return blocks;
};
