import fs from 'fs/promises';
import path from 'path';
import { BrowserProfileSchema, type BrowserProfile, type ProfileManifest } from '../../types/profile.js';
import { createDefaultProfile } from '../fingerprint/generator.js';
import { computeDeviceSignature } from '../fingerprint/device-generator.js';

export class ProfileStore {
  private dataDir: string;
  private profilesDir: string;
  private manifestPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.profilesDir = path.join(dataDir, 'profiles');
    this.manifestPath = path.join(dataDir, 'manifest.json');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.profilesDir, { recursive: true });
    try {
      await fs.access(this.manifestPath);
      const m = await this.loadManifest();
      if (!m.trash) {
        m.trash = [];
        await this.saveManifest(m);
      }
    } catch {
      const defaultProfile = createDefaultProfile();
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
    for (const p of await this.list()) {
      if (p.group) groups.add(p.group);
    }
    return [...groups].sort();
  }

  async getTags(): Promise<string[]> {
    const tags = new Set<string>();
    for (const p of await this.list()) {
      for (const t of p.tags) tags.add(t);
    }
    return [...tags].sort();
  }

  async updateMeta(id: string, meta: {
    name?: string; group?: string; tags?: string[]; color?: string; remark?: string;
    warmupPresetId?: string; warmupOnLaunch?: boolean; workspace?: string;
    headless?: boolean; minFpScore?: number;
    rotationMode?: 'off' | 'session' | 'random';
    proxyPoolIds?: string[];
  }): Promise<BrowserProfile | null> {
    const profile = await this.get(id);
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
    await this.save(profile);
    return profile;
  }

  async assignProxy(id: string, proxy: BrowserProfile['proxy']): Promise<BrowserProfile | null> {
    const profile = await this.get(id);
    if (!profile) return null;
    profile.proxy = proxy;
    await this.save(profile);
    return profile;
  }

  async get(id: string): Promise<BrowserProfile | null> {
    const manifest = await this.loadManifest();
    return manifest.profiles.find((p) => p.id === id && !p.deletedAt) ?? null;
  }

  async save(profile: BrowserProfile): Promise<void> {
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
      manifest.profiles.push(validated);
    }
    manifest.updatedAt = Date.now();
    await this.saveManifest(manifest);
  }

  async saveMany(profiles: BrowserProfile[]): Promise<void> {
    for (const p of profiles) await this.save(p);
  }

  /** Soft delete → trash (30-day recovery) */
  async remove(id: string): Promise<void> {
    const manifest = await this.loadManifest();
    const profile = manifest.profiles.find((p) => p.id === id);
    if (!profile) return;
    profile.deletedAt = Date.now();
    manifest.trash = manifest.trash ?? [];
    manifest.trash.push(profile);
    manifest.profiles = manifest.profiles.filter((p) => p.id !== id);
    manifest.updatedAt = Date.now();
    await this.saveManifest(manifest);
  }

  async restore(id: string): Promise<BrowserProfile | null> {
    const manifest = await this.loadManifest();
    const idx = (manifest.trash ?? []).findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const profile = manifest.trash![idx];
    delete profile.deletedAt;
    manifest.profiles.push(profile);
    manifest.trash!.splice(idx, 1);
    manifest.updatedAt = Date.now();
    await this.saveManifest(manifest);
    return profile;
  }

  async purge(id: string): Promise<void> {
    const manifest = await this.loadManifest();
    manifest.trash = (manifest.trash ?? []).filter((p) => p.id !== id);
    manifest.updatedAt = Date.now();
    await this.saveManifest(manifest);
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
    const raw = await fs.readFile(this.manifestPath, 'utf-8');
    const m = JSON.parse(raw) as ProfileManifest;
    if (!m.trash) m.trash = [];
    return m;
  }

  async saveManifest(manifest: ProfileManifest): Promise<void> {
    if (!manifest.trash) manifest.trash = [];
    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  getDataDir(): string {
    return this.dataDir;
  }
}
