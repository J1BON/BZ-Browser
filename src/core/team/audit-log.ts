import fs from 'fs/promises';
import path from 'path';

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
      this.entries = JSON.parse(raw) as AuditEntry[];
    } catch {
      this.entries = [];
    }
  }

  async log(actorEmail: string, action: string, target?: string, detail?: string): Promise<void> {
    this.entries.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      actorEmail,
      action,
      target,
      detail,
    });
    if (this.entries.length > 5000) this.entries = this.entries.slice(0, 5000);
    await fs.writeFile(this.filePath, JSON.stringify(this.entries, null, 2));
  }

  list(limit = 100): AuditEntry[] {
    return this.entries.slice(0, limit);
  }
}
