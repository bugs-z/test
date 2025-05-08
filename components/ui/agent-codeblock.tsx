'use client';

import { type JSX, useLayoutEffect, useState } from 'react';
import { highlight, CODE_THEMES } from '@/lib/shiki/shared';
import { cn } from '@/lib/utils';
import type { AgentCodeBlockLang } from '@/types';
import { useTheme } from 'next-themes';
import { CopyButton } from '@/components/messages/message-codeblock';
import stripAnsi from 'strip-ansi';

interface AgentCodeBlockProps {
  code: string;
  lang: AgentCodeBlockLang;
  filename?: string;
}

export function AgentCodeBlock({ code, lang, filename }: AgentCodeBlockProps) {
  const [nodes, setNodes] = useState<JSX.Element | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { resolvedTheme } = useTheme();

  useLayoutEffect(() => {
    setIsLoading(true);

    const theme =
      resolvedTheme === 'dark' ? CODE_THEMES.dark : CODE_THEMES.light;

    void highlight(code, {
      lang,
      theme,
      customComponents: {
        pre: (props) => (
          <pre
            {...props}
            className={cn(
              'relative rounded-md overflow-hidden bg-muted text-sm break-words whitespace-pre-wrap',
            )}
          />
        ),
        code: (props) => (
          <code
            {...props}
            className="block p-4 overflow-x-auto break-all whitespace-pre-wrap text-sm"
          />
        ),
      },
    })
      .then(setNodes)
      .finally(() => setIsLoading(false));
  }, [code, lang, resolvedTheme]);

  if (isLoading) {
    return (
      <div className={cn('animate-pulse bg-muted/50 rounded-md p-4')}>
        <div className="h-4 w-3/4 bg-muted rounded" />
        <div className="h-4 w-1/2 bg-muted rounded mt-2" />
      </div>
    );
  }

  return (
    <div className="relative rounded-md overflow-hidden bg-muted">
      <div className="flex items-center justify-between px-4 py-1 border-b">
        {filename && (
          <span className="text-xs text-muted-foreground font-mono">
            {filename}
          </span>
        )}
        <CopyButton value={lang === 'ansi' ? stripAnsi(code) : code} />
      </div>
      {nodes}
    </div>
  );
}
