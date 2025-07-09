import { createWebSearchTool } from './web-search';
import { createBrowserTool } from './browser';
import { createImageGenTool } from './image-gen';
import { createShellExecTool } from './run_terminal_cmd-tool';
import { createGetTerminalFilesTool } from './get_terminal_files-tool';
import { DefaultSandboxManager } from './agent/utils/sandbox-manager';
import { Sandbox } from '@e2b/code-interpreter';
import { ToolContext } from './agent/types';
import type { AgentMode } from '@/types/llms';

export const createToolSchemas = ({
  profile,
  dataStream,
  abortSignal,
  agentMode,
  pentestFiles,
  messages,
  isTerminalContinuation,
}: {
  profile: any;
  dataStream: any;
  abortSignal: AbortSignal;
  agentMode?: AgentMode;
  pentestFiles?: Array<{ path: string; data: Buffer }>;
  messages?: any[];
  isTerminalContinuation?: boolean;
}) => {
  let sandbox: Sandbox | null = null;

  const sandboxManager = new DefaultSandboxManager(
    profile.user_id,
    dataStream,
    (newSandbox) => {
      sandbox = newSandbox;
    },
    sandbox,
  );

  const context = {
    dataStream,
    sandbox,
    userID: profile.user_id,
    setSandbox: sandboxManager.setSandbox.bind(sandboxManager),
    agentMode,
    sandboxManager,
    pentestFiles,
    messages,
    isTerminalContinuation,
  } as ToolContext;

  const allSchemas = {
    image_gen: createImageGenTool(profile, abortSignal, dataStream),
    webSearch: createWebSearchTool(profile, dataStream),
    browser: createBrowserTool(profile, abortSignal, dataStream),
    run_terminal_cmd: createShellExecTool(context),
    get_terminal_files: createGetTerminalFilesTool(context),
  };

  type SchemaKey = keyof typeof allSchemas;

  return {
    allSchemas,
    getSelectedSchemas: (selectedTool: string | string[]) => {
      if (
        selectedTool === 'all' ||
        !selectedTool ||
        selectedTool.length === 0
      ) {
        return allSchemas;
      }
      if (typeof selectedTool === 'string') {
        return selectedTool in allSchemas
          ? {
              [selectedTool as SchemaKey]:
                allSchemas[selectedTool as SchemaKey],
            }
          : {};
      }
      return Object.fromEntries(
        Object.entries(allSchemas).filter(([key]) =>
          selectedTool.includes(key),
        ),
      );
    },
    getSandbox: () => sandbox,
    getSandboxManager: () => sandboxManager,
  };
};
