import { SANDBOX_TEMPLATE, BASH_SANDBOX_TIMEOUT } from '../types';
import {
  createOrConnectTemporaryTerminal,
  createOrConnectPersistentTerminal,
} from '@/lib/tools/e2b/sandbox';

export interface SandboxContext {
  userID: string;
  dataStream: any;
  setSandbox?: (sandbox: any) => void;
}

export const handleFileError = (error: unknown, context: string): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `Error ${context}: ${errorMessage}`;
};

export const createPersistentSandbox = async (
  userID: string,
  template: string,
  timeout: number,
  setSandbox?: (sandbox: any) => void,
) => {
  try {
    const sandbox = await createOrConnectPersistentTerminal(
      userID,
      template,
      timeout,
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
  setSandbox?: (sandbox: any) => void,
) => {
  try {
    const sandbox = await createOrConnectTemporaryTerminal(
      userID,
      template,
      timeout,
    );
    if (setSandbox) {
      setSandbox(sandbox);
    }
    return sandbox;
  } catch (error) {
    throw new Error(handleFileError(error, 'creating temporary sandbox'));
  }
};

export const ensureSandboxConnection = async (
  context: SandboxContext,
  options: {
    initialSandbox?: any;
    initialPersistentSandbox?: boolean;
  } = {},
): Promise<{ sandbox: any; persistentSandbox: boolean }> => {
  const { userID, setSandbox } = context;

  const { initialSandbox, initialPersistentSandbox = true } = options;

  let sandbox = initialSandbox;
  const persistentSandbox = initialPersistentSandbox;

  if (!sandbox) {
    sandbox = persistentSandbox
      ? await createPersistentSandbox(
          userID,
          SANDBOX_TEMPLATE,
          BASH_SANDBOX_TIMEOUT,
          setSandbox,
        )
      : await createTemporarySandbox(
          userID,
          SANDBOX_TEMPLATE,
          BASH_SANDBOX_TIMEOUT,
          setSandbox,
        );
  }

  return { sandbox, persistentSandbox };
};
