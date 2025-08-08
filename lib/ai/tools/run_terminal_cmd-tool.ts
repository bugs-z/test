import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './agent/types';
import { executeTerminalCommand } from '@/lib/ai/tools/agent/terminal-executor';
import { streamTerminalOutput } from '@/lib/ai/terminal-utils';
import PostHogClient from '@/app/posthog';
import { PluginID } from '@/types';

/**
 * Creates a terminal tool for executing commands in the sandbox environment
 * @param context - The context needed for tool execution
 * @returns The terminal tool
 */
export const createShellExecTool = (context: ToolContext) => {
  const { dataStream, userID, sandboxManager, selectedPlugin } = context;

  // Conditionally build the file upload note - only show for large files or binary analysis
  const fileUploadNote =
    selectedPlugin !== PluginID.TERMINAL
      ? `
<file_upload_note>
For large files (massive lists, wordlists, logs) or binary files, explain that files are only uploaded to the sandbox automatically when 'Use terminal' is selected from the tools dropdown.
</file_upload_note>
`
      : '';

  return tool({
    description: `Execute commands in the sandbox environment. Use for executing terminal commands, running code, installing packages, or managing files.

<shell_guidelines>
- When using the shell tool, you must adhere to the following rules:
- For complex and long-running scans (e.g., nmap, dirb, gobuster), save results to files using \
appropriate output flags (e.g., -oN for nmap) if the tool supports it, otherwise use redirect with \
> operator for future reference and documentation
- MUST avoid commands that require confirmation; use flags like \`-y\` or \`-f\` for automatic execution
- Avoid commands with excessive output; redirect to files when necessary
- Chain multiple commands with \`&&\` to reduce interruptions and handle errors cleanly
- Use pipes (\`|\`) to simplify workflows by passing outputs between commands
- Use non-interactive \`bc\` for simple calculations, Python for complex math; never calculate mentally
- If user provided binary file or file content is empty, use terminal commands to access it
- Always check if a command exists before trying to use it.
- Use \`cat\` to print the contents of a file to the console.
- When users want to download or access files created/modified in the terminal sandbox, use the get_terminal_files tool to provide them as attachments.
</shell_guidelines>
${fileUploadNote}
<sandbox_environment>
System Environment:
- OS: Debian GNU/Linux 12 linux/amd64 (with internet access)
- User: \`root\` (with sudo privileges)
- Home directory: /home/user
- VPN connectivity is not available due to missing TUN/TAP device support in the sandbox environment

Development Environment:
- Python 3.12.10 (commands: python3, pip3)
- Node.js 20.19.2 (commands: node, npm)
- Golang 1.24.2 (commands: go)

Pre-installed Tools:
- curl, wget, nmap, iputils-ping, whois, traceroute, dnsutils, whatweb, wafw00f, subfinder, gobuster
- SecLists is pre-installed in /home/user and should be used by default for any fuzzing or wordlist needs
</sandbox_environment>

<error_handling>
- On error, first verify the tool name and arguments are valid
- Diagnose the issue using the error message and context, and attempt a fix
- If unresolved, try alternative methods or tools, but NEVER repeat the same action
- If all attempts fail, explain the failure to the user and request further guidance
</error_handling>`,
    parameters: z.object({
      exec_dir: z
        .string()
        .describe(
          'Working directory for command execution (must use absolute path)',
        ),
      command: z.string().describe('Shell command to execute'),
    }),
    execute: async (args) => {
      const posthog = PostHogClient();
      posthog?.capture({
        distinctId: userID,
        event: 'terminal',
      });

      const { exec_dir, command } = args as {
        exec_dir: string;
        command: string;
      };

      if (!sandboxManager) {
        throw new Error('Sandbox manager not initialized');
      }

      // Get sandbox from manager
      const { sandbox } = await sandboxManager.getSandbox();

      // Execute command
      const terminalStream = await executeTerminalCommand({
        userID,
        command,
        exec_dir,
        sandbox,
      });

      const terminalOutput = await streamTerminalOutput(
        terminalStream,
        dataStream,
      );
      return terminalOutput;
    },
  });
};
