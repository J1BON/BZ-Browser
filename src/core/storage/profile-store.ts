import fs from 'fs/promises';
import path from 'path';
import { BrowserProfileSchema, type BrowserProfile, type ProfileManifest } from '../../types/profile.js';
import { createDefaultProfile } from '../fingerprint/generator.js';
import { computeDeviceSignature } from '../fingerprint/device-generator.js';
import { seedNewProfileSearch } from '../browser/search-setup.js';

export class ProfileStore {
  private dataDir: string;
  private profilesDir: string;
  private manifestPath: string;
  private manifestTmpPath: string;
  private manifestBakPath: string;
  /** In-process write mutex — chains all manifest writes to prevent lost-update races */
  private writeLock: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.profilesDir = path.join(dataDir, 'profiles');
    this.manifestPath = path.join(dataDir, 'manifest.json');
    this.manifestTmpPath = path.join(dataDir, 'manifest.json.tmp');
    this.manifestBakPath = path.join(dataDir, 'manifest.json.bak');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.profilesDir, { recursive: true });
    try {
      const m = await this.loadManifest();
      let changed = false;
      if (!m.trash) { m.trash = []; changed = true; }
      for (const p of m.profiles) {
        if (p.minFpScore === 85) { p.minFpScore = 0; changed = true; }
        // Migrate: assign serial numbers to profiles that lack them
        if (p.serialNumber === undefined || p.serialNumber === null) {
          changed = true;
        }
      }
      if (changed) {
        // Assign missing serial numbers in order
        const maxSerial = m.profiles.reduce((max, p) => Math.max(max, p.serialNumber ?? 0), 0);
        let nextSerial = maxSerial + 1;
        for (const p of m.profiles) {
          if (p.serialNumber === undefined || p.serialNumber === null) {
            (p as any).serialNumber = nextSerial++;
          }
        }
        await this.saveManifest(m);
      }
    } catch {
      const defaultProfile = createDefaultProfile();
      (defaultProfile as any).serialNumber = 1;
      await this.saveManifest({
        version: 1,
        profiles: [defaultProfile],
        trash: [],
        updatedAt: Date.now(),
      });
      await this.saveProfileData(defaultProfile.id, {});
    }
  }

  async list(): Promise<BrowserProfile[]> {
    const manifest = await this.loadManifest();
    return manifest.profiles.filter((p) => !p.deletedAt);
  }

  async listTrash(): Promise<BrowserProfile[]> {
    const manifest = await this.loadManifest();
    return manifest.trash ?? [];
  }

  async listWorkspaces(): Promise<string[]> {
    const ws = new Set<string>();
    for (const p of await this.list()) {
      if (p.workspace) ws.add(p.workspace);
    }
    return [...ws].sort();
  }

  async listByGroup(group: string): Promise<BrowserProfile[]> {
    return (await this.list()).filter((p) => p.group === group);
  }

  async listByTag(tag: string): Promise<BrowserProfile[]> {
    return (await this.list()).filter((p) => p.tags.includes(tag));
  }

  async getGroups(): Promise<string[]> {
    const groups = new Set<string>();
    for (const p of await this.list()) { if (p.group) groups.add(p.group); }
    return [...groups].sort();
  }

  async getTags(): Promise<string[]> {
    const tags = new Set<string>();
    for (const p of await this.list()) { for (const t of p.tags) tags.add(t); }
    return [...tags].sort();
  }

  async updateMeta(id: string, meta: {
    name?: string; group?: string; tags?: string[]; color?: string; remark?: string;
    warmupPresetId?: string; warmupOnLaunch?: boolean; workspace?: string;
    headless?: boolean; minFpScore?: number;
    rotationMode?: 'off' | 'session' | 'random';
    proxyPoolIds?: string[];
  }): Promise<BrowserProfile | null> {
    return this.withWriteLock(async () => {
      const manifest = await this.loadManifest();
      const profile = manifest.profiles.find((p) => p.id === id && !p.deletedAt);
      if (!profile) return null;
      if (meta.name !== undefined) profile.name = meta.name;
      if (meta.group !== undefined) profile.group = meta.group || undefined;
      if (meta.tags !== undefined) profile.tags = meta.tags;
      if (meta.color !== undefined) profile.color = meta.color;
      if (meta.remark !== undefined) profile.remark = meta.remark;
      if (meta.warmupPresetId !== undefined) profile.warmupPresetId = meta.warmupPresetId || undefined;
      if (meta.warmupOnLaunch !== undefined) profile.warmupOnLaunch = meta.warmupOnLaunch;
      if (meta.workspace !== undefined) profile.workspace = meta.workspace || undefined;
      if (meta.headless !== undefined) profile.headless = meta.headless;
      if (meta.minFpScore !== undefined) profile.minFpScore = meta.minFpScore;
      if (meta.rotationMode !== undefined) profile.proxy.rotationMode = meta.rotationMode;
      if (meta.proxyPoolIds !== undefined) profile.proxyPoolIds = meta.proxyPoolIds;
      manifest.updatedAt = Date.now();
      await this.saveManifest(manifest);
      return profile;
    });
  }

  async assignProxy(id: string, proxy: BrowserProfile['proxy']): Promise<BrowserProfile | null> {
    return this.withWriteLock(async () => {
      const manifest = await this.loadManifest();
      const profile = manifest.profiles.find((p) => p.id === id && !p.deletedAt);
      if (!profile) return null;
      profile.proxy = proxy;
      manifest.updatedAt = Date.now();
      await this.saveManifest(manifest);
      return profile;
    });
  }

  async get(id: string): Promise<BrowserProfile | null> {
    const manifest = await this.loadManifest();
    return manifest.profiles.find((p) => p.id === id && !p.deletedAt) ?? null;
  }

  async save(profile: BrowserProfile): Promise<void> {
    return this.withWriteLock(async () => {
      const normalized = {
        ...profile,
        deviceSignature: profile.deviceSignature ?? computeDeviceSignature(profile.fingerprint),
      };
      const validated = BrowserProfileSchema.parse(normalized);
      const sig = validated.deviceSignature ?? computeDeviceSignature(validated.fingerprint);
      const manifest = await this.loadManifest();
      const duplicate = manifest.profiles.find(
        (p) => p.id !== validated.id && !p.deletedAt
          && (p.deviceSignature ?? computeDeviceSignature(p.fingerprint)) === sig,
      );
      if (duplicate) {
        throw new Error(
          `Antidetect collision: "${duplicate.name}" shares the same device identity. Use "New Device" on one profile.`,
        );
      }
      const idx = manifest.profiles.findIndex((p) => p.id === validated.id);
      if (idx >= 0) {
        manifest.profiles[idx] = validated;
      } else {
        // Auto-assign serial number for new profiles
        const maxSerial = manifest.profiles.reduce((max, p) => Math.max(max, (p as any).serialNumber ?? 0), 0);
        (validated as any).serialNumber = maxSerial + 1;
        manifest.profiles.push(validated);
        await seedNewProfileSearch(this.dataDir, validated.id).catch((err) => {
          console.warn('[ProfileStore] search pre-seed failed:', err);
        });
      }
      manifest.updatedAt = Date.now();
      await this.saveManifest(manifest);
    });
  }

  async saveMany(profiles: BrowserProfile[]): Promise<void> {
    // Load once, mutate all, save once — avoids N separate read-write cycles
    return this.withWriteLock(async () => {
      const manifest = await this.loadManifest();
      let maxSerial = manifest.profiles.reduce((max, p) => Math.max(max, (p as any).serialNumber ?? 0), 0);
      for (const profile of profiles) {
        const normalized = {
          ...profile,
          deviceSignature: profile.deviceSignature ?? computeDeviceSignature(profile.fingerprint),
        };
        const validated = BrowserProfileSchema.parse(normalized);
        const idx = manifest.profiles.findIndex((p) => p.id === validated.id);
        if (idx >= 0) {
          manifest.profiles[idx] = validated;
        } else {
          (validated as any).serialNumber = ++maxSerial;
          manifest.profiles.push(validated);
          await seedNewProfileSearch(this.dataDir, validated.id).catch((err) => {
            console.warn('[ProfileStore] search pre-seed failed:', err);
          });
        }
      }
      manifest.updatedAt = Date.now();
      await this.saveManifest(manifest);
    });
  }

  /** Soft delete → trash (30-day recovery) */
  async remove(id: string): Promise<void> {
    return this.withWriteLock(async () => {
      const manifest = await this.loadManifest();
      const profile = manifest.profiles.find((p) => p.id === id);
      if (!profile) return;
      profile.deletedAt = Date.now();
      manifest.trash = manifest.trash ?? [];
      manifest.trash.push({ ...profile });
      manifest.profiles = manifest.profiles.filter((p) => p.id !== id);
      manifest.updatedAt = Date.now();
      await this.saveManifest(manifest);
    });
  }

  async restore(id: string): Promise<BrowserProfile | null> {
    return this.withWriteLock(async () => {
      const manifest = await this.loadManifest();
      const idx = (manifest.trash ?? []).findIndex((p) => p.id === id);
      if (idx < 0) return null;
      // Clone first to avoid mutating trash entry before splice
      const profile: BrowserProfile = { ...manifest.trash![idx] };
      delete profile.deletedAt;
      manifest.trash!.splice(idx, 1);
      manifest.profiles.push(profile);
      manifest.updatedAt = Date.now();
      await this.saveManifest(manifest);
      return profile;
    });
  }

  async purge(id: string): Promise<void> {
    await this.withWriteLock(async () => {
      const manifest = await this.loadManifest();
      manifest.trash = (manifest.trash ?? []).filter((p) => p.id !== id);
      manifest.updatedAt = Date.now();
      await this.saveManifest(manifest);
    });
    const profileDir = path.join(this.profilesDir, id);
    await fs.rm(profileDir, { recursive: true, force: true });
  }

  getProfileDataDir(id: string): string {
    return path.join(this.profilesDir, id, 'browser-data');
  }

  async saveProfileData(id: string, meta: Record<string, unknown>): Promise<void> {
    const dir = path.join(this.profilesDir, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  }

  async loadManifest(): Promise<ProfileManifest> {
    // Try primary file first, fall back to .bak on parse error
    for (const filePath of [this.manifestPath, this.manifestBakPath]) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const m = JSON.parse(raw) as ProfileManifest;
        if (!m.trash) m.trash = [];
        return m;
      } catch {
        continue;
      }
    }
    throw new Error('manifest.json is corrupt and backup is unavailable');
  }

  async saveManifest(manifest: ProfileManifest): Promise<void> {
    if (!manifest.trash) manifest.trash = [];
    const json = JSON.stringify(manifest, null, 2);
    // Atomic write: write to .tmp then rename (prevents corrupt state on crash)
    await fs.writeFile(this.manifestTmpPath, json, 'utf-8');
    // Save a backup of the last known-good state before replacing
    try { await fs.copyFile(this.manifestPath, this.manifestBakPath); } catch { /* first run */ }
    await fs.rename(this.manifestTmpPath, this.manifestPath);
  }

  getDataDir(): string {
    return this.dataDir;
  }

  /** Serializes all writes through a promise chain to prevent concurrent mutations */
  private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeLock.then(fn);
    // Absorb any rejection from the chain so future writes aren't blocked
    this.writeLock = next.then(() => undefined, () => undefined);
    return next;
  }
}
