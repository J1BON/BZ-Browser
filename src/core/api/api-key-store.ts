import fs from 'fs/promises';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

export interface ApiKeyEntry {
  id: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: number;
  lastUsed?: number;
  permissions: string[];
}

export class ApiKeyStore {
  private filePath: string;
  private keys: ApiKeyEntry[] = [];

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'api-keys.json');
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.keys = JSON.parse(raw) as ApiKeyEntry[];
    } catch {
      this.keys = [];
      await this.save();
    }
  }

  async save(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.keys, null, 2));
  }

  hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  async create(name: string, permissions: string[] = ['*']): Promise<{ entry: ApiKeyEntry; rawKey: string }> {
    const rawKey = `cab_${randomBytes(24).toString('hex')}`;
    const entry: ApiKeyEntry = {
      id: randomBytes(8).toString('hex'),
      name,
      keyHash: this.hashKey(rawKey),
      prefix: rawKey.slice(0, 12),
      createdAt: Date.now(),
      permissions,
    };
    this.keys.push(entry);
    await this.save();
    return { entry, rawKey };
  }

  validate(rawKey: string): ApiKeyEntry | null {
    const hash = this.hashKey(rawKey);
    const entry = this.keys.find((k) => k.keyHash === hash);
    if (entry) {
      entry.lastUsed = Date.now();
      void this.save();
    }
    return entry ?? null;
  }

  list(): Omit<ApiKeyEntry, 'keyHash'>[] {
    return this.keys.map(({ keyHash: _, ...rest }) => rest);
  }

  async revoke(id: string): Promise<void> {
    this.keys = this.keys.filter((k) => k.id !== id);
    await this.save();
  }
}
