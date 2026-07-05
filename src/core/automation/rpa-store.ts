import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { RpaScriptSchema, type RpaScript } from '../../types/rpa.js';

export class RpaStore {
  private scriptsPath: string;
  private scripts: RpaScript[] = [];

  constructor(dataDir: string) {
    this.scriptsPath = path.join(dataDir, 'rpa-scripts.json');
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.scriptsPath, 'utf-8');
      const parsed = JSON.parse(raw) as RpaScript[];
      this.scripts = parsed.map((s) => RpaScriptSchema.parse(s));
    } catch {
      this.scripts = [];
      await this.save();
    }
  }

  async save(): Promise<void> {
    await fs.writeFile(this.scriptsPath, JSON.stringify(this.scripts, null, 2));
  }

  list(profileId?: string): RpaScript[] {
    if (!profileId) return this.scripts;
    return this.scripts.filter((s) => s.profileId === profileId);
  }

  get(id: string): RpaScript | undefined {
    return this.scripts.find((s) => s.id === id);
  }

  async upsert(script: RpaScript): Promise<RpaScript> {
    const validated = RpaScriptSchema.parse(script);
    const idx = this.scripts.findIndex((s) => s.id === validated.id);
    if (idx >= 0) this.scripts[idx] = validated;
    else this.scripts.push(validated);
    await this.save();
    return validated;
  }

  async create(name: string, profileId?: string): Promise<RpaScript> {
    const now = Date.now();
    const script: RpaScript = {
      id: uuidv4(),
      name,
      profileId,
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.upsert(script);
  }

  async remove(id: string): Promise<void> {
    this.scripts = this.scripts.filter((s) => s.id !== id);
    await this.save();
  }
}
