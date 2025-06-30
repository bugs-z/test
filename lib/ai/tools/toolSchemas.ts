// import { executeWebSearchTool } from './web-search';
// import { executeBrowserTool } from './browser';
import { z } from 'zod';
// import type { LLMID, ModelParams } from '@/types/llms';
// import type { ChatMetadata } from '@/types';
// import type { Doc } from '@/convex/_generated/dataModel';
import { createExaWebSearchTool } from './web-search-v2';
import { createBrowserTool } from './browser';

export const createToolSchemas = ({
  // chat,
  // messages,
  // modelParams,
  // chatMetadata,
  profile,
  dataStream,
  // abortSignal,
  // model,
  // userCity,
  // userCountry,
  // initialChatPromise,
  // assistantMessageId,
}: {
  // chat: Doc<'chats'> | null;
  // messages: any;
  // modelParams: ModelParams;
  // chatMetadata: ChatMetadata;
  profile: any;
  dataStream: any;
  // abortSignal: AbortSignal;
  // model: LLMID;
  // userCity: string | undefined;
  // userCountry: string | undefined;
  // initialChatPromise: Promise<void>;
  // assistantMessageId: string;
}) => {
  const allSchemas = {
    webSearch: createExaWebSearchTool(profile),
    browser: createBrowserTool(profile),
    hackerAIMCP: {
      description: `Activate the HackerAI MCP agent for comprehensive penetration testing and cybersecurity operations. \
Select this tool IMMEDIATELY when any security testing, terminal operations, or technical tasks are needed.

This tool uses HackerAI MCP (https://www.hackerai.co/) which provides a specialized penetration testing environment. \
For users who want to use different models, they can access the pentest agent directly through HackerAI MCP with any model of their choice.

Use the pentestAgent when:
1. Performing network reconnaissance, scanning, or enumeration
2. Conducting vulnerability assessments or penetration testing
3. Running security tools or custom scripts
4. Analyzing web applications for security issues
5. Installing and configuring security tools
6. Writing and executing penetration testing scripts
7. Any terminal operations or command-line tasks
8. File operations, system analysis, or technical research`,
      parameters: z.object({
        activate: z
          .boolean()
          .describe(
            'Set to true to activate the HackerAI MCP agent for security testing and terminal operations. Select immediately when any technical or security tasks are needed.',
          ),
      }),
    },
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
  };
};
