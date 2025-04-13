import { SANDBOX_TEMPLATE, BASH_SANDBOX_TIMEOUT } from '../types';
import {
  createOrConnectTemporaryTerminal,
  createOrConnectPersistentTerminal,
} from '@/lib/tools/e2b/sandbox';

export interface SandboxContext {
  userID: string;
  dataStream: any;
  isPremiumUser?: boolean;
  selectedPlugin?: string;
  terminalTemplate?: string;
  setSandbox?: (sandbox: any) => void;
  setPersistentSandbox?: (persistent: boolean) => void;
}

export const handleFileError = (error: unknown, context: string): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `Error ${context}: ${errorMessage}`;
};

export const createPersistentSandbox = async (
  userID: string,
  template: string,
  timeout: number,
  dataStream: any,
  setSandbox?: (sandbox: any) => void,
) => {
  try {
    const sandbox = await createOrConnectPersistentTerminal(
      userID,
      template,
      timeout,
      dataStream,
    );
    if (setSandbox) {
      setSandbox(sandbox);
    }
    return sandbox;
  } catch (error) {
    throw new Error(handleFileError(error, 'creating persistent sandbox'));
  }
};

export const createTemporarySandbox = async (
  userID: string,
  template: string,
  timeout: number,
  dataStream: any,
  setSandbox?: (sandbox: any) => void,
) => {
  try {
    const sandbox = await createOrConnectTemporaryTerminal(
      userID,
      template,
      timeout,
      dataStream,
    );
    if (setSandbox) {
      setSandbox(sandbox);
    }
    return sandbox;
  } catch (error) {
    throw new Error(handleFileError(error, 'creating temporary sandbox'));
  }
};

export const getSandboxTemplate = (template?: string): string => {
  return template || SANDBOX_TEMPLATE;
};

export const getSandboxTimeout = (): number => {
  return BASH_SANDBOX_TIMEOUT;
};

export const ensureSandboxConnection = async (
  context: SandboxContext,
  options: {
    initialSandbox?: any;
    initialPersistentSandbox?: boolean;
    useTemporarySandbox?: boolean;
  } = {},
): Promise<{ sandbox: any; persistentSandbox: boolean }> => {
  const {
    userID,
    dataStream,
    isPremiumUser = true,
    selectedPlugin,
    terminalTemplate = SANDBOX_TEMPLATE,
    setSandbox,
    setPersistentSandbox,
  } = context;

  const {
    initialSandbox,
    initialPersistentSandbox = true,
    useTemporarySandbox,
  } = options;

  let sandbox = initialSandbox;
  let persistentSandbox = initialPersistentSandbox;

  // Determine sandbox type based on context
  if (!isPremiumUser) {
    persistentSandbox = false;
  } else if (selectedPlugin) {
    persistentSandbox = false; // Always use temporary sandbox for plugins
  } else {
    persistentSandbox = !useTemporarySandbox;
  }

  // Update persistent sandbox state in parent context
  if (setPersistentSandbox) {
    setPersistentSandbox(persistentSandbox);
  }

  // Create or connect to sandbox
  if (!sandbox) {
    sandbox = persistentSandbox
      ? await createPersistentSandbox(
          userID,
          terminalTemplate,
          BASH_SANDBOX_TIMEOUT,
          dataStream,
          setSandbox,
        )
      : await createTemporarySandbox(
          userID,
          terminalTemplate,
          BASH_SANDBOX_TIMEOUT,
          dataStream,
          setSandbox,
        );
  }

  return { sandbox, persistentSandbox };
};
