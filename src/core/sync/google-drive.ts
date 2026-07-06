import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import extract from 'extract-zip';
import { google, type drive_v3 } from 'googleapis';
import type { BrowserProfile, ProfileManifest, SyncState, ConflictResolution } from '../../types/profile.js';
import { encryptBuffer, decryptBuffer } from './encryption.js';
import {
  computeProfileSyncMeta,
  hasProfileChanged,
  loadSyncMeta,
  saveSyncMeta,
  getSyncMetaPath,
  type ProfileSyncMeta,
} from './incremental.js';
import {
  resolveSyncConflict,
  applyRemoteProfile,
  bumpSyncVersion,
  type SyncConflict,
} from './conflict-resolver.js';

const DRIVE_FOLDER_NAME = 'BZBrowser';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];
const ENCRYPTED_EXT = '.enc';

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenPath: string;
  settingsPath: string;
}

interface SyncSettings {
  passphraseHash: string | null;
  lastSyncAt: number | null;
  autoSync: boolean;
  teamFolderId: string | null;
  useTeamFolder: boolean;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  skipped: number;
  conflicts: SyncConflict[];
}

export class GoogleDriveSync {
  private drive: drive_v3.Drive | null = null;
  private folderId: string | null = null;
  private config: GoogleDriveConfig;
  private settings: SyncSettings = { passphraseHash: null, lastSyncAt: null, autoSync: true, teamFolderId: null, useTeamFolder: false };
  private passphrase: string | null = null;

  constructor(config: GoogleDriveConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    await this.loadSettings();
    await this.loadSavedAuth();
  }

  setPassphrase(passphrase: string): void {
    this.passphrase = passphrase;
  }

  isEncryptionEnabled(): boolean {
    return this.passphrase !== null || this.settings.passphraseHash !== null;
  }

  async savePassphrase(passphrase: string): Promise<void> {
    const { hashPassphrase } = await import('./encryption.js');
    this.passphrase = passphrase;
    this.settings.passphraseHash = hashPassphrase(passphrase);
    await this.saveSettings();
  }

  getAuthUrl(): string {
    const oauth2 = this.createOAuth2();
    return oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
  }

  async authenticate(code: string): Promise<void> {
    const oauth2 = this.createOAuth2();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);
    await fs.writeFile(this.config.tokenPath, JSON.stringify(tokens, null, 2));
    this.drive = google.drive({ version: 'v3', auth: oauth2 });
    this.folderId = await this.ensureAppFolder();
  }

  async loadSavedAuth(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.config.tokenPath, 'utf-8');
      const tokens = JSON.parse(raw);
      const oauth2 = this.createOAuth2();
      oauth2.setCredentials(tokens);
      this.drive = google.drive({ version: 'v3', auth: oauth2 });
      this.folderId = await this.ensureAppFolder();
      return true;
    } catch {
      return false;
    }
  }

  async getUserEmail(): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.config.tokenPath, 'utf-8');
      const tokens = JSON.parse(raw);
      const oauth2 = this.createOAuth2();
      oauth2.setCredentials(tokens);
      const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 });
      const { data } = await oauth2api.userinfo.get();
      return data.email?.toLowerCase() ?? null;
    } catch {
      return null;
    }
  }

  async getSyncState(): Promise<SyncState> {
    return {
      connected: this.drive !== null,
      lastSyncAt: this.settings.lastSyncAt,
      driveFolderId: this.folderId,
      teamFolderId: this.settings.teamFolderId,
      useTeamFolder: this.settings.useTeamFolder,
      pendingUploads: [],
      pendingDownloads: [],
      encryptionEnabled: this.isEncryptionEnabled(),
      autoSync: this.settings.autoSync,
    };
  }

  async setTeamFolder(folderId: string): Promise<SyncState> {
    this.settings.teamFolderId = folderId;
    await this.saveSettings();
    return this.getSyncState();
  }

  async setUseTeamFolder(useTeam: boolean): Promise<SyncState> {
    this.settings.useTeamFolder = useTeam;
    if (useTeam && this.settings.teamFolderId) {
      this.folderId = this.settings.teamFolderId;
    } else if (this.drive) {
      this.folderId = await this.ensureAppFolder();
    }
    await this.saveSettings();
    return this.getSyncState();
  }

  getActiveFolderId(): string | null {
    if (this.settings.useTeamFolder && this.settings.teamFolderId) {
      return this.settings.teamFolderId;
    }
    return this.folderId;
  }

  async syncProfile(
    profile: BrowserProfile,
    dataDir: string,
    resolution?: ConflictResolution,
  ): Promise<{ action: 'uploaded' | 'downloaded' | 'skipped' | 'conflict'; profile?: BrowserProfile }> {
    if (!this.drive || !this.folderId) throw new Error('Not connected to Google Drive');
    this.requirePassphrase();

    const browserDataDir = path.join(dataDir, 'profiles', profile.id, 'browser-data');
    const syncMetaPath = getSyncMetaPath(dataDir, profile.id);
    const localMeta = await loadSyncMeta(syncMetaPath);
    const changed = await hasProfileChanged(browserDataDir, localMeta);

    const remoteMetaRaw = await this.downloadFile(`${profile.id}.sync-meta.json`);
    const remoteProfileRaw = await this.downloadFile(`${profile.id}.meta.json`);

    let remoteProfile: BrowserProfile | null = null;
    let remoteMeta: ProfileSyncMeta | null = null;

    if (remoteProfileRaw) {
      remoteProfile = JSON.parse(this.maybeDecrypt(remoteProfileRaw).toString()) as BrowserProfile;
    }
    if (remoteMetaRaw) {
      remoteMeta = JSON.parse(this.maybeDecrypt(remoteMetaRaw).toString()) as ProfileSyncMeta;
    }

    const decision = resolveSyncConflict(
      profile,
      localMeta,
      remoteProfile,
      remoteMeta,
      resolution,
    );

    if (decision.action === 'skip' || (!changed && decision.action === 'upload')) {
      return { action: 'skipped' };
    }

    if (decision.action === 'conflict') {
      throw Object.assign(new Error('Sync conflict'), { conflict: decision.conflict });
    }

    if (decision.action === 'download' && remoteProfile) {
      await this.downloadProfileBundle(profile.id, dataDir);
      return { action: 'downloaded', profile: applyRemoteProfile(profile, remoteProfile) };
    }

    await this.uploadProfileBundle(profile, browserDataDir, dataDir);
    return { action: 'uploaded', profile: bumpSyncVersion(profile) };
  }

  async syncAll(
    localManifest: ProfileManifest,
    store: { save: (p: BrowserProfile) => Promise<void>; getDataDir: () => string },
    resolutions?: Record<string, ConflictResolution>,
  ): Promise<SyncResult> {
    this.requirePassphrase();

    const result: SyncResult = { uploaded: 0, downloaded: 0, skipped: 0, conflicts: [] };
    const dataDir = store.getDataDir();
    const remoteIds = await this.listRemoteProfiles();
    const localIds = new Set(localManifest.profiles.map((p) => p.id));

    for (const profile of localManifest.profiles) {
      try {
        const { action, profile: updated } = await this.syncProfile(profile, dataDir, resolutions?.[profile.id]);
        if (action === 'uploaded') {
          result.uploaded++;
          if (updated) await store.save(updated);
        } else if (action === 'downloaded') {
          result.downloaded++;
          if (updated) await store.save(updated);
        } else {
          result.skipped++;
        }
      } catch (err) {
        if (err instanceof Error && 'conflict' in err) {
          result.conflicts.push((err as Error & { conflict: SyncConflict }).conflict);
        } else {
          throw err;
        }
      }
    }

    for (const remoteId of remoteIds) {
      if (!localIds.has(remoteId)) {
        const targetDir = path.join(dataDir, 'profiles', remoteId);
        await fs.mkdir(targetDir, { recursive: true });
        const profile = await this.downloadProfileBundle(remoteId, dataDir);
        if (profile) {
          await store.save(profile);
          result.downloaded++;
        }
      }
    }

    this.settings.lastSyncAt = Date.now();
    await this.saveSettings();
    return result;
  }

  async uploadProfileBundle(
    profile: BrowserProfile,
    browserDataDir: string,
    dataDir: string,
  ): Promise<void> {
    if (!this.drive || !this.folderId) throw new Error('Not connected');

    const zipPath = path.join(dataDir, 'profiles', profile.id, `${profile.id}.sync.zip`);
    await this.zipDirectory(browserDataDir, zipPath);
    const zipBuffer = await fs.readFile(zipPath);

    const updatedProfile = bumpSyncVersion(profile);
    const syncMeta = await computeProfileSyncMeta(profile.id, browserDataDir, updatedProfile.syncVersion);
    await saveSyncMeta(getSyncMetaPath(dataDir, profile.id), syncMeta);

    await this.uploadEncrypted(`${profile.id}.meta.json`, Buffer.from(JSON.stringify(updatedProfile)));
    await this.uploadEncrypted(`${profile.id}.sync-meta.json`, Buffer.from(JSON.stringify(syncMeta)));
    await this.uploadEncrypted(`${profile.id}.sync.zip`, zipBuffer);

    await fs.rm(zipPath, { force: true });
  }

  async downloadProfileBundle(profileId: string, dataDir: string): Promise<BrowserProfile | null> {
    if (!this.drive || !this.folderId) throw new Error('Not connected');

    const metaRaw = await this.downloadFile(`${profileId}.meta.json`);
    if (!metaRaw) return null;

    const profile = JSON.parse(this.maybeDecrypt(metaRaw).toString()) as BrowserProfile;

    const syncMetaRaw = await this.downloadFile(`${profileId}.sync-meta.json`);
    if (syncMetaRaw) {
      const syncMeta = JSON.parse(this.maybeDecrypt(syncMetaRaw).toString()) as ProfileSyncMeta;
      await saveSyncMeta(getSyncMetaPath(dataDir, profileId), syncMeta);
    }

    const zipRaw = await this.downloadFile(`${profileId}.sync.zip`);
    if (zipRaw) {
      const zipBuffer = this.maybeDecrypt(zipRaw);
      const zipPath = path.join(dataDir, 'profiles', profileId, `${profileId}.sync.zip`);
      const extractDir = path.join(dataDir, 'profiles', profileId, 'browser-data');
      await fs.mkdir(extractDir, { recursive: true });
      await fs.writeFile(zipPath, zipBuffer);
      await extract(zipPath, {
        dir: extractDir,
        onEntry: (entry) => {
          const destPath = path.resolve(extractDir, entry.fileName);
          if (!destPath.startsWith(path.resolve(extractDir) + path.sep) && destPath !== path.resolve(extractDir)) {
            throw new Error(`Zip slip validation failed: "${entry.fileName}"`);
          }
        }
      });
      await fs.rm(zipPath, { force: true });
    }

    return profile;
  }

  async syncSingleProfile(
    profileId: string,
    store: { get: (id: string) => Promise<BrowserProfile | null>; save: (p: BrowserProfile) => Promise<void>; getDataDir: () => string },
  ): Promise<void> {
    const profile = await store.get(profileId);
    if (!profile) return;
    const { profile: updated } = await this.syncProfile(profile, store.getDataDir());
    if (updated) await store.save(updated);
  }

  setAutoSync(enabled: boolean): void {
    this.settings.autoSync = enabled;
    void this.saveSettings();
  }

  private requirePassphrase(): void {
    if (!this.passphrase && this.settings.passphraseHash) {
      throw new Error('Enter your encryption passphrase to sync');
    }
  }

  private maybeDecrypt(data: Buffer): Buffer {
    if (!this.passphrase) return data;
    try {
      return decryptBuffer(data, this.passphrase);
    } catch {
      return data;
    }
  }

  private async uploadEncrypted(name: string, content: Buffer): Promise<void> {
    const payload = this.passphrase ? encryptBuffer(content, this.passphrase) : content;
    const fileName = this.passphrase ? `${name}${ENCRYPTED_EXT}` : name;
    await this.uploadOrUpdate(fileName, payload, 'application/octet-stream');
  }

  private createOAuth2() {
    const { OAuth2 } = google.auth;
    return new OAuth2(this.config.clientId, this.config.clientSecret, this.config.redirectUri);
  }

  private async ensureAppFolder(): Promise<string> {
    if (!this.drive) throw new Error('Drive not initialized');

    const res = await this.drive.files.list({
      q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });

    if (res.data.files?.[0]?.id) return res.data.files[0].id;

    const folder = await this.drive.files.create({
      requestBody: {
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    return folder.data.id!;
  }

  private async uploadOrUpdate(name: string, content: Buffer, mimeType: string): Promise<void> {
    const folderId = this.getActiveFolderId();
    if (!this.drive || !folderId) return;

    const existing = await this.drive.files.list({
      q: `name='${name}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    const media = { mimeType, body: Readable.from(content) };

    if (existing.data.files?.[0]?.id) {
      await this.drive.files.update({ fileId: existing.data.files[0].id, media });
    } else {
      await this.drive.files.create({
        requestBody: { name, parents: [folderId] },
        media,
      });
    }
  }

  private async downloadFile(name: string): Promise<Buffer | null> {
    const folderId = this.getActiveFolderId();
    if (!this.drive || !folderId) return null;

    for (const tryName of [name, `${name}${ENCRYPTED_EXT}`]) {
      const res = await this.drive.files.list({
        q: `name='${tryName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
      });

      const fileId = res.data.files?.[0]?.id;
      if (!fileId) continue;

      const file = await this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
      return Buffer.from(file.data as ArrayBuffer);
    }

    return null;
  }

  private async listRemoteProfiles(): Promise<string[]> {
    const folderId = this.getActiveFolderId();
    if (!this.drive || !folderId) return [];

    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and (name contains '.meta.json') and trashed=false`,
      fields: 'files(name)',
    });

    return (res.data.files ?? [])
      .map((f) => f.name?.replace('.meta.json', '').replace(ENCRYPTED_EXT, '') ?? '')
      .filter(Boolean);
  }

  private zipDirectory(sourceDir: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      void (async () => {
        try {
          const archiver = (await import('archiver')).default;
          const output = createWriteStream(outPath);
          const archive = archiver('zip', { zlib: { level: 6 } });
          output.on('close', () => resolve());
          archive.on('error', reject);
          archive.pipe(output);
          archive.directory(sourceDir, false);
          await archive.finalize();
        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      const raw = await fs.readFile(this.config.settingsPath, 'utf-8');
      this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch {
      // defaults
    }
  }

  private async saveSettings(): Promise<void> {
    await fs.mkdir(path.dirname(this.config.settingsPath), { recursive: true });
    await fs.writeFile(this.config.settingsPath, JSON.stringify(this.settings, null, 2));
  }
}
