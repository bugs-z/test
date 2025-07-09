import type { Sandbox } from '@e2b/code-interpreter';
import type { AgentMode } from '@/types/llms';

export interface SandboxManager {
  getSandbox: () => Promise<{ sandbox: Sandbox }>;
  setSandbox: (sandbox: Sandbox) => void;
}

/**
 * Interface for tools that need access to the data stream
 */
export interface ToolContext {
  dataStream: any;
  sandbox?: Sandbox | null;
  userID: string;
  setSandbox: (sandbox: Sandbox) => void;
  agentMode: AgentMode;
  sandboxManager?: SandboxManager;
  userCountryCode?: string | null;
  pentestFiles?: Array<{ path: string; data: Buffer }>;
  messages?: any[];
  isTerminalContinuation?: boolean;
}

// Constants for sandbox creation
export const SANDBOX_TEMPLATE = 'terminal-agent-sandbox';
export const BASH_SANDBOX_TIMEOUT = 15 * 60 * 1000;
