import type { ContentBlock } from './types';

export const parseContent = (content: string): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  const blockRegex =
    /((?:<terminal-command[^>]*>[\s\S]*?<\/terminal-command>|```terminal\n[\s\S]*?```|<file-content[^>]*>[\s\S]*?<\/file-content>|<file-write[^>]*>[\s\S]*?<\/file-write>|<file-str-replace[^>]*>[\s\S]*?<\/file-str-replace>|<shell-wait[^>]*>[\s\S]*?<\/shell-wait>|<info_search_web[^>]*>[\s\S]*?<\/info_search_web>)(?:\n```(?:stdout)[\s\S]*?(?:```|$))*(?:\s*<terminal-error>[\s\S]*?<\/terminal-error>)?)/g;
  const terminalXmlRegex =
    /<terminal-command(?:\s+[^>]*)?>([\s\S]*?)<\/terminal-command>/;
  const terminalMarkdownRegex = /```terminal\n([\s\S]*?)```/;
  const fileContentRegex =
    /<file-content(?:\s+path="([^"]*)")?>([\s\S]*?)<\/file-content>/;
  const fileWriteRegex =
    /<file-write(?:\s+file="([^"]*)")?>([\s\S]*?)<\/file-write>/;
  const fileStrReplaceRegex =
    /<file-str-replace(?:\s+file="([^"]*)")?>([\s\S]*?)<\/file-str-replace>/;
  const shellWaitRegex = /<shell-wait[^>]*>([\s\S]*?)<\/shell-wait>/;
  const infoSearchWebRegex =
    /<info_search_web(?:\s+query="([^"]*)")?[^>]*>([\s\S]*?)<\/info_search_web>/;
  const stdoutRegex = /```stdout\n([\s\S]*?)(?:```|$)/;
  const errorRegex = /<terminal-error>([\s\S]*?)<\/terminal-error>/;
  const execDirRegex = /exec-dir="([^"]*)"/;

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
    const fileContentMatch = block.match(fileContentRegex);
    const fileWriteMatch = block.match(fileWriteRegex);
    const fileStrReplaceMatch = block.match(fileStrReplaceRegex);
    const shellWaitMatch = block.match(shellWaitRegex);
    const infoSearchWebMatch = block.match(infoSearchWebRegex);
    const stdoutMatch = block.match(stdoutRegex);
    const errorMatch = block.match(errorRegex);
    const execDirMatch = terminalXmlMatch ? block.match(execDirRegex) : null;

    if (shellWaitMatch) {
      blocks.push({
        type: 'shell-wait',
        content: {
          seconds: shellWaitMatch[1].trim(),
        },
      });
    } else if (infoSearchWebMatch) {
      const query = infoSearchWebMatch[1] || '';
      const searchResults = JSON.parse(infoSearchWebMatch[2]);
      blocks.push({
        type: 'info-search-web',
        content: {
          query,
          results: searchResults,
        },
      });
    } else if (terminalXmlMatch || terminalMarkdownMatch) {
      blocks.push({
        type: 'terminal',
        content: {
          command: (
            terminalXmlMatch?.[1] ||
            terminalMarkdownMatch?.[1] ||
            ''
          ).trim(),
          stdout: stdoutMatch ? stdoutMatch[1].trim() : '',
          error: errorMatch ? errorMatch[1].trim() : undefined,
          exec_dir: execDirMatch ? execDirMatch[1] : undefined,
        },
      });
    } else if (fileContentMatch) {
      blocks.push({
        type: 'file-content',
        content: {
          path: fileContentMatch[1] || '',
          content: fileContentMatch[2].trim(),
          isWrite: false,
        },
      });
    } else if (fileWriteMatch) {
      blocks.push({
        type: 'file-content',
        content: {
          path: fileWriteMatch[1] || '',
          content: fileWriteMatch[2].trim(),
          isWrite: true,
        },
      });
    } else if (fileStrReplaceMatch) {
      blocks.push({
        type: 'file-content',
        content: {
          path: fileStrReplaceMatch[1] || '',
          content: fileStrReplaceMatch[2].trim(),
          isWrite: true,
          isStrReplace: true,
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
