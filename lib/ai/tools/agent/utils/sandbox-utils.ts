import { SANDBOX_TEMPLATE, BASH_SANDBOX_TIMEOUT } from '../types';
import {
  createOrConnectTemporaryTerminal,
  createOrConnectPersistentTerminal,
} from '@/lib/tools/e2b/sandbox';

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
  sandbox: any,
  userID: string,
  template: string,
  timeout: number,
  dataStream: any,
  setSandbox?: (sandbox: any) => void,
  persistentSandbox = true,
): Promise<any> => {
  if (!sandbox) {
    return persistentSandbox
      ? await createPersistentSandbox(
          userID,
          template,
          timeout,
          dataStream,
          setSandbox,
        )
      : await createTemporarySandbox(
          userID,
          template,
          timeout,
          dataStream,
          setSandbox,
        );
  }
  return sandbox;
};
