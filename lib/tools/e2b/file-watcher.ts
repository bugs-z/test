import type { Sandbox } from '@e2b/code-interpreter';
import { saveFileToDatabase } from '@/lib/ai/tools/agent/utils/file-db-utils';

// Set to track unique files that have been modified during execution
const modifiedFiles = new Set<string>();

export interface FileWatcherOptions {
  userId: string;
  dataStream: any;
}

export class FileWatcher {
  private sandbox: Sandbox;
  private options: FileWatcherOptions;
  private watcher: any;
  private isWatching = false;

  constructor(sandbox: Sandbox, options: FileWatcherOptions) {
    this.sandbox = sandbox;
    this.options = options;
  }

  async startWatching(dirname: string): Promise<void> {
    if (this.isWatching) {
      return;
    }

    this.watcher = await this.sandbox.files.watchDir(
      dirname,
      this.handleFileChange.bind(this),
    );

    this.isWatching = true;
  }

  private handleFileChange(event: { type: string; name: string }): void {
    if (event.type === 'write') {
      modifiedFiles.add(event.name);
    }
  }

  async saveAllModifiedFiles(): Promise<void> {
    if (modifiedFiles.size === 0) {
      return;
    }

    for (const fileName of modifiedFiles) {
      try {
        const content = await this.sandbox.files.read(fileName);
        await saveFileToDatabase(
          fileName,
          content,
          this.options.userId,
          this.options.dataStream,
        );
      } catch (error) {
        console.error(
          `[${this.options.userId}] Failed to save ${fileName}:`,
          error,
        );
      }
    }

    modifiedFiles.clear();
  }

  async stop(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    // Save all modified files before stopping
    await this.saveAllModifiedFiles();

    // Stop the watcher
    if (this.watcher) {
      await this.watcher.stop();
    }

    this.isWatching = false;
  }
}
