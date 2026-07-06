import fs from 'fs/promises';
import path from 'path';
import { ExtensionEntrySchema, type ExtensionEntry } from '../../types/phase4.js';
import { joinChromeExtensionArgs } from '../browser/chrome-path.js';

export class ExtensionLoader {
  private extensionsDir: string;
  private registryPath: string;
  private writeLock: Promise<void> = Promise.resolve();

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

  getExtensionsDir(): string {
    return this.extensionsDir;
  }

  async list(): Promise<ExtensionEntry[]> {
    try {
      const raw = JSON.parse(await fs.readFile(this.registryPath, 'utf-8')) as { extensions: ExtensionEntry[] };
      return Array.isArray(raw?.extensions) ? raw.extensions : [];
    } catch (err) {
      console.warn('[ExtensionLoader] registry.json unreadable:', (err as Error).message);
      return [];
    }
  }

  async register(entry: ExtensionEntry): Promise<ExtensionEntry[]> {
    this.writeLock = this.writeLock.then(async () => {
      const validated = ExtensionEntrySchema.parse(entry);
      const all = await this.list();
      const idx = all.findIndex((e) => e.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fs.writeFile(this.registryPath, JSON.stringify({ extensions: all }, null, 2));
    }).catch(() => {});
    return this.writeLock.then(() => this.list());
  }

  async remove(id: string): Promise<ExtensionEntry[]> {
    this.writeLock = this.writeLock.then(async () => {
      const all = (await this.list()).filter((e) => e.id !== id);
      await fs.writeFile(this.registryPath, JSON.stringify({ extensions: all }, null, 2));
      const extDir = path.join(this.extensionsDir, id);
      await fs.rm(extDir, { recursive: true, force: true }).catch(() => {});
    }).catch(() => {});
    return this.writeLock.then(() => this.list());
  }

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
          console.warn(`[ExtensionLoader] Extension ${id} path missing or unreadable — skipping`);
        }
      }
    }
    return paths;
  }

  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  async importUnpacked(sourcePath: string, name?: string, stableId?: string): Promise<ExtensionEntry[]> {
    const manifestPath = path.join(sourcePath, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as { name?: string; version?: string };
    const id = stableId ?? (path.basename(sourcePath).slice(0, 32) || manifest.name?.replace(/\s/g, '_') || `ext-${Date.now()}`);
    const destPath = path.join(this.extensionsDir, id);

    await fs.rm(destPath, { recursive: true, force: true }).catch(() => {});
    await this.copyDirRecursive(sourcePath, destPath);

    const entry: ExtensionEntry = {
      id,
      name: name ?? manifest.name ?? id,
      path: destPath,
      version: manifest.version,
      enabled: true,
    };

    return this.register(entry);
  }

  buildChromeArgs(extensionPaths: string[]): string[] {
    return joinChromeExtensionArgs(extensionPaths);
  }
}
