import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MessageMarkdown } from '../message-markdown';
import {
  IconChevronDown,
  IconChevronUp,
  IconTerminal2,
  IconArrowDown,
  IconArrowUp,
} from '@tabler/icons-react';
import { PluginID } from '@/types/plugins';
import { terminalPlugins } from '../message-type-solver';
import { useUIContext } from '@/context/ui-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CopyButton } from '../message-codeblock';
import stripAnsi from 'strip-ansi';

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

const MAX_VISIBLE_LINES = 20;
const COMMAND_LENGTH_THRESHOLD = 40; // Threshold for when to switch to full terminal view

const ShowMoreButton = ({
  isExpanded,
  onClick,
  remainingLines,
}: {
  isExpanded: boolean;
  onClick: () => void;
  remainingLines: number;
}) => (
  <div className="flex justify-center py-1">
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={onClick}
    >
      {isExpanded ? (
        <>
          <IconArrowUp size={14} className="mr-1" />
          Show Less
        </>
      ) : (
        <>
          <IconArrowDown size={14} className="mr-1" />
          Show More ({remainingLines} more lines)
        </>
      )}
    </Button>
  </div>
);

export const MessageTerminal: React.FC<MessageTerminalProps> = ({
  content,
  messageId,
  isAssistant,
}) => {
  const { showTerminalOutput, toolInUse, isMobile } = useUIContext();
  const contentBlocks = useMemo(() => parseContent(content), [content]);

  const [closedBlocks, setClosedBlocks] = useState(() => new Set<number>());
  const [userInteracted, setUserInteracted] = useState(() => new Set<number>());
  const [expandedOutputs, setExpandedOutputs] = useState(
    () => new Set<number>(),
  );

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

  const toggleExpanded = useCallback((index: number) => {
    setExpandedOutputs((prev) => {
      const newSet = new Set(prev);
      newSet.has(index) ? newSet.delete(index) : newSet.add(index);
      return newSet;
    });
  }, []);

  const renderContent = (content: string) => (
    // content.length > 12000 ? (
    //   <div className="mt-4">
    //     <MessageTooLong
    //       content={content}
    //       plugin={PluginID.TERMINAL}
    //       id={messageId || ''}
    //     />
    //   </div>
    // ) : (
    <MessageMarkdown content={content} isAssistant={true} />
  );
  // );

  const renderTerminalBlock = useCallback(
    (block: TerminalBlock, index: number) => {
      const hasOutput = block.stdout || block.stderr || block.error;
      const outputContent = [block.stdout, block.stderr, block.error]
        .filter(Boolean)
        .join('\n');

      const lines = outputContent.split('\n');
      const shouldShowMore = lines.length > MAX_VISIBLE_LINES;
      const isExpanded = expandedOutputs.has(index);
      const displayedContent = isExpanded
        ? outputContent
        : lines.slice(0, MAX_VISIBLE_LINES).join('\n');

      const isLongCommand =
        block.command.length > COMMAND_LENGTH_THRESHOLD || isMobile;
      const showFullTerminalView = isLongCommand;

      return (
        <div
          className={`overflow-hidden rounded-lg border border-border ${index === 1 ? 'mb-3' : 'my-3'}`}
        >
          <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-2">
            <div className="flex items-center flex-1 min-w-0">
              <div
                className={cn('flex items-center shrink-0 mr-2', {
                  'animate-pulse':
                    contentBlocks.length - 1 === index &&
                    terminalPlugins.includes(toolInUse as PluginID),
                })}
              >
                <IconTerminal2 size={16} className="mr-2" />
                <span>Executing command</span>
              </div>
              {!showFullTerminalView && (
                <div className="min-w-0 flex-1">
                  <code className="truncate block font-mono text-muted-foreground text-sm">
                    {block.command}
                  </code>
                </div>
              )}
            </div>
            <div className="flex items-center ml-4">
              {hasOutput && (
                <>
                  <CopyButton value={stripAnsi(outputContent)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleBlock(index)}
                    aria-expanded={!closedBlocks.has(index)}
                    aria-controls={`terminal-content-${index}`}
                  >
                    {closedBlocks.has(index) ? (
                      <IconChevronDown size={18} />
                    ) : (
                      <IconChevronUp size={18} />
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
          {!closedBlocks.has(index) && (
            <div
              id={`terminal-content-${index}`}
              className="bg-foreground dark:bg-background
            "
            >
              {showFullTerminalView && (
                <div className="font-mono text-foreground/80">
                  {renderContent(
                    `\`\`\`stdout\nubuntu@sandbox:~$ ${block.command}\n\`\`\``,
                  )}
                </div>
              )}
              {block.stdout && (
                <div className="font-mono text-foreground/80">
                  {renderContent(
                    `\`\`\`stdout\n${shouldShowMore ? displayedContent : block.stdout}\n\`\`\``,
                  )}
                  {shouldShowMore &&
                    block.stdout.split('\n').length > MAX_VISIBLE_LINES && (
                      <ShowMoreButton
                        isExpanded={expandedOutputs.has(index)}
                        onClick={() => toggleExpanded(index)}
                        remainingLines={lines.length - MAX_VISIBLE_LINES}
                      />
                    )}
                </div>
              )}
              {block.stderr && (
                <div className="font-mono text-destructive/90">
                  {renderContent(
                    `\`\`\`stderr\n${shouldShowMore ? displayedContent : block.stderr}\n\`\`\``,
                  )}
                  {shouldShowMore &&
                    block.stderr.split('\n').length > MAX_VISIBLE_LINES && (
                      <ShowMoreButton
                        isExpanded={expandedOutputs.has(index)}
                        onClick={() => toggleExpanded(index)}
                        remainingLines={lines.length - MAX_VISIBLE_LINES}
                      />
                    )}
                </div>
              )}
              {block.error && (
                <div className="font-mono text-destructive/90">
                  {renderContent(
                    `\`\`\`stderr\n${shouldShowMore ? displayedContent : block.error}\n\`\`\``,
                  )}
                  {shouldShowMore &&
                    block.error.split('\n').length > MAX_VISIBLE_LINES && (
                      <ShowMoreButton
                        isExpanded={expandedOutputs.has(index)}
                        onClick={() => toggleExpanded(index)}
                        remainingLines={lines.length - MAX_VISIBLE_LINES}
                      />
                    )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [
      closedBlocks,
      expandedOutputs,
      renderContent,
      toggleBlock,
      toolInUse,
      isMobile,
    ],
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
