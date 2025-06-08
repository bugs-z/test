import React, { type FC, memo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';
import { MessageCodeBlock } from './message-codeblock';
import { defaultUrlTransform } from 'react-markdown';
import { ImageWithPreview } from '@/components/image/image-with-preview';
import { Table, Th, Td } from '@/components/ui/table-components';
import { MessageTerminalBlock } from './terminal-messages/message-terminal-block';
import ReactMarkdown, { type Components } from 'react-markdown';
import { DownloadCSVTable } from '@/components/ui/download-csv-table';
import { LinkWithTooltip } from '@/components/ui/link-with-tooltip';

const urlTransform = (url: string) => {
  if (url.startsWith('data:')) return url;
  return defaultUrlTransform(url);
};

const NonMemoizedMarkdown: FC<{
  content: string;
  isAssistant: boolean;
}> = ({ content, isAssistant }) => {
  if (!isAssistant) {
    return (
      <div className="prose dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 bg-secondary w-[80vw] min-w-full space-y-6 break-words rounded-3xl px-5 py-2.5 sm:w-full overflow-hidden">
        <p className="mb-2 whitespace-pre-wrap last:mb-0 break-all">
          {content}
        </p>
      </div>
    );
  }

  const components: Partial<Components> = {
    a({ children, href, ...props }) {
      if (typeof children === 'string' && /^\d+$/.test(children) && href) {
        return <LinkWithTooltip href={href}>{children}</LinkWithTooltip>;
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
    p({ children }) {
      return <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>;
    },
    img({ src, ...props }) {
      return <ImageWithPreview src={src!} alt={props.alt || 'image'} />;
    },
    table: ({ children, ...props }) => {
      return (
        <div className="w-full">
          <Table {...props}>{children}</Table>
          <DownloadCSVTable />
        </div>
      );
    },
    th: ({ children, ...props }) => <Th {...props}>{children}</Th>,
    td: ({ children, ...props }) => <Td {...props}>{children}</Td>,
    code({ className, children, ...props }) {
      // Extract content as string early for consistent handling
      const content = String(children);
      const match = /language-(\w+)/.exec(className || '');
      const language = match?.[1] || '';

      // Check if it's inline code (single line, no newlines)
      const isInlineCode = !content.includes('\n');

      if (isInlineCode) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }

      // Handle terminal/stdout output
      if (language === 'stdout') {
        return <MessageTerminalBlock value={content} />;
      }

      // Handle code blocks with syntax highlighting
      return (
        <MessageCodeBlock language={language} value={content} {...props} />
      );
    },
  };

  return (
    <div className="prose dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-[80vw] min-w-full space-y-6 break-words sm:w-full [&_mjx-container]:flex [&_mjx-container]:max-w-full [&_mjx-container]:overflow-x-auto [&_mjx-math]:p-2">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: false }],
        ]}
        rehypePlugins={[rehypeMathjax]}
        urlTransform={urlTransform}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export const MessageMarkdown: FC<{
  content: string;
  isAssistant: boolean;
}> = memo(NonMemoizedMarkdown);
