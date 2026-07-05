import fs from 'fs/promises';
import path from 'path';
import { ExtensionEntrySchema, type ExtensionEntry } from '../../types/phase4.js';

export class ExtensionLoader {
  private extensionsDir: string;
  private registryPath: string;

  constructor(dataDir: string) {
    this.extensionsDir = path.join(dataDir, 'extensions');
    this.registryPath = path.join(dataDir, 'extensions.json');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.extensionsDir, { recursive: true });
    try {
      await fs.access(this.registryPath);
    } catch {
      await fs.writeFile(this.registryPath, JSON.stringify({ extensions: [] }, null, 2));
    }
  }

  async list(): Promise<ExtensionEntry[]> {
    const raw = JSON.parse(await fs.readFile(this.registryPath, 'utf-8')) as { extensions: ExtensionEntry[] };
    return raw.extensions;
  }

  async register(entry: ExtensionEntry): Promise<ExtensionEntry[]> {
    const validated = ExtensionEntrySchema.parse(entry);
    const all = await this.list();
    const idx = all.findIndex((e) => e.id === validated.id);
    if (idx >= 0) all[idx] = validated;
    else all.push(validated);
    await fs.writeFile(this.registryPath, JSON.stringify({ extensions: all }, null, 2));
    return all;
  }

  async remove(id: string): Promise<ExtensionEntry[]> {
    const all = (await this.list()).filter((e) => e.id !== id);
    await fs.writeFile(this.registryPath, JSON.stringify({ extensions: all }, null, 2));
    return all;
  }

  /** Resolve extension paths for a profile's extension ID list */
  async resolvePaths(extensionIds: string[]): Promise<string[]> {
    const registry = await this.list();
    const paths: string[] = [];
    for (const id of extensionIds) {
      const entry = registry.find((e) => e.id === id && e.enabled);
      if (entry) {
        try {
          await fs.access(entry.path);
          paths.push(entry.path);
        } catch {
          // skip missing
        }
      }
    }
    return paths;
  }

  async importUnpacked(sourcePath: string, name?: string): Promise<ExtensionEntry[]> {
    const manifestPath = path.join(sourcePath, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as { name?: string; version?: string };
    const id = path.basename(sourcePath).slice(0, 32) || manifest.name?.replace(/\s/g, '_') || 'ext';

    const entry: ExtensionEntry = {
      id,
      name: name ?? manifest.name ?? id,
      path: sourcePath,
      version: manifest.version,
      enabled: true,
    };

    return this.register(entry);
  }

  /** Scan Broearn unpacked extensions folder */
  async importFromBroearn(broearnExtDir: string): Promise<number> {
    let count = 0;
    try {
      const entries = await fs.readdir(broearnExtDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const extRoot = path.join(broearnExtDir, entry.name);
        try {
          const versions = await fs.readdir(extRoot);
          for (const ver of versions) {
            const full = path.join(extRoot, ver);
            const stat = await fs.stat(full);
            if (stat.isDirectory()) {
              await this.importUnpacked(full, entry.name);
              count++;
              break;
            }
          }
        } catch {
          await this.importUnpacked(extRoot, entry.name).catch(() => {});
          count++;
        }
      }
    } catch {
      // ignore
    }
    return count;
  }

  buildChromeArgs(extensionPaths: string[]): string[] {
    if (extensionPaths.length === 0) return [];
    return [`--load-extension=${extensionPaths.join(',')}`];
  }
}
