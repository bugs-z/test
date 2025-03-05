import { executeWebSearchTool } from "./web-search"
import { executeTerminalTool } from "./terminal"
import { executeBrowserTool } from "./browser"
import { z } from "zod"

export const createToolSchemas = ({
  chatSettings,
  messages,
  profile,
  dataStream,
  isTerminalContinuation
}: {
  chatSettings?: any
  messages?: any
  profile?: any
  dataStream?: any
  isTerminalContinuation?: boolean
}) => {
  const allSchemas = {
    browser: {
      description: `Browse one or more webpages (up to 3) and extract their text content. For HTML retrieval or more complex web scraping, use the Python tool. \
This tool can extract text content from webpages but cannot retrieve HTML, images, or other non-text elements directly. \
When specific webpage information is needed, it fetches the most current text data, then analyzes and answers the query. \
This tool can only visit HTTPS websites and cannot access HTTP-only sites. \
Use this tool when: \
- The human explicitly requests webpage browsing or reference links. \
- Current information from a specific website is required for answering human queries.`,
      parameters: z.object({
        open_url: z
          .union([
            z.string().url().describe("The URL of the webpage to browse"),
            z
              .array(z.string().url())
              .max(3)
              .describe("Up to 3 URLs to browse simultaneously")
          ])
          .describe("One URL as a string or an array of up to 3 URLs to browse")
      }),
      execute: async ({ open_url }: { open_url: string | string[] }) => {
        return executeBrowserTool({
          open_url,
          config: { chatSettings, profile, messages, dataStream }
        })
      }
    },
    webSearch: {
      description: `Search the web for latest information. Use this tool only in specific circumstances: \
1) When the human inquires about current events or requires real-time information such as weather conditions or sports scores. \
2) When the human explicitly requests or instructs to google, search the web or similar. \
Do not use this tool to open URLs, links, or videos. \
Do not use this tool if the human is merely asking about the possibility of searching the web.`,
      parameters: z.object({
        search: z.boolean().describe("Set to true to search the web")
      }),
      execute: async () => {
        return executeWebSearchTool({
          config: {
            messages,
            profile,
            dataStream,
            isLargeModel: true
          }
        })
      }
    },
    terminal: {
      description: `Run terminal commands. Select this tool IMMEDIATELY when any terminal operations are needed, don't say or plan anything before selecting this tool.

This tool executes Bash commands in a Debian environment with root privileges. Use this tool when:
1. The human requests to run any command or script
2. The human needs to perform network scanning, enumeration, or other security testing
3. The human needs to install, configure, or use security tools
4. The human needs to analyze files, data, or system information
5. Any task requiring command-line operations`,
      parameters: z.object({
        terminal: z
          .boolean()
          .describe(
            "Set to true to use the terminal for executing bash commands. Select immediately when terminal operations are needed."
          )
      }),
      execute: async () => {
        return executeTerminalTool({
          config: {
            messages,
            profile,
            dataStream,
            isTerminalContinuation
          }
        })
      }
    }
  }

  type SchemaKey = keyof typeof allSchemas

  return {
    allSchemas,
    getSelectedSchemas: (selectedPlugin: string | string[]) => {
      if (
        selectedPlugin === "all" ||
        !selectedPlugin ||
        selectedPlugin.length === 0
      ) {
        return allSchemas
      }
      if (typeof selectedPlugin === "string") {
        return selectedPlugin in allSchemas
          ? {
              [selectedPlugin as SchemaKey]:
                allSchemas[selectedPlugin as SchemaKey]
            }
          : {}
      }
      return Object.fromEntries(
        Object.entries(allSchemas).filter(([key]) =>
          selectedPlugin.includes(key)
        )
      )
    }
  }
}
