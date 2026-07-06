import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface AuditEntry {
  id: string;
  timestamp: number;
  actorEmail: string;
  action: string;
  target?: string;
  detail?: string;
}

export class AuditLog {
  private filePath: string;
  private entries: AuditEntry[] = [];

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'audit-log.json');
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.entries = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.warn('[AuditLog] audit-log.json corrupt — backing up and starting fresh');
        await fs.rename(this.filePath, this.filePath + '.corrupt').catch(() => {});
      }
      this.entries = [];
    }
  }

  async log(actorEmail: string, action: string, target?: string, detail?: string): Promise<void> {
    this.entries.unshift({
      id: randomUUID(), // Use secure crypto UUID (BUG 57 fixed)
      timestamp: Date.now(),
      actorEmail,
      action,
      target,
      detail,
    });
    if (this.entries.length > 5000) this.entries = this.entries.slice(0, 5000);
    // Atomic write
    const tmp = this.filePath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.entries, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  list(limit = 100): AuditEntry[] {
    return this.entries.slice(0, limit);
  }
}
