import type { Sandbox } from '@e2b/code-interpreter';
import type { SandboxManager } from '../types';
import { ensureSandboxConnection } from './sandbox-utils';

export class DefaultSandboxManager implements SandboxManager {
  private sandbox: Sandbox | null = null;
  private persistentSandbox = true;

  constructor(
    private userID: string,
    private dataStream: any,
    private setSandboxCallback: (sandbox: Sandbox) => void,
    initialSandbox?: Sandbox | null,
    initialPersistentSandbox = true,
  ) {
    this.sandbox = initialSandbox || null;
    this.persistentSandbox = initialPersistentSandbox;
  }

  async getSandbox(): Promise<{
    sandbox: Sandbox;
    persistentSandbox: boolean;
  }> {
    if (!this.sandbox) {
      const result = await ensureSandboxConnection(
        {
          userID: this.userID,
          dataStream: this.dataStream,
          setSandbox: this.setSandboxCallback,
        },
        {
          initialSandbox: this.sandbox,
          initialPersistentSandbox: this.persistentSandbox,
        },
      );
      this.sandbox = result.sandbox;
      this.persistentSandbox = result.persistentSandbox;
    }

    if (!this.sandbox) {
      throw new Error('Failed to initialize sandbox');
    }

    return { sandbox: this.sandbox, persistentSandbox: this.persistentSandbox };
  }

  setSandbox(sandbox: Sandbox): void {
    this.sandbox = sandbox;
    this.setSandboxCallback(sandbox);
  }
}
