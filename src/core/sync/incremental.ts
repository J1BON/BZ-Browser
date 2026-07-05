import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

/** Files that matter for session continuity — sync these incrementally */
const SYNC_FILES = [
  'Default/Cookies',
  'Default/Cookies-journal',
  'Default/Local Storage',
  'Default/Session Storage',
  'Default/IndexedDB',
  'Default/Preferences',
  'Default/Network Persistent State',
];

export interface ProfileSyncMeta {
  profileId: string;
  contentHash: string;
  lastModified: number;
  syncVersion: number;
  fileHashes: Record<string, string>;
}

export async function computeProfileSyncMeta(
  profileId: string,
  browserDataDir: string,
  syncVersion = 1,
): Promise<ProfileSyncMeta> {
  const fileHashes: Record<string, string> = {};
  let combined = '';

  for (const rel of SYNC_FILES) {
    const full = path.join(browserDataDir, rel);
    const hash = await hashPath(full);
    if (hash) {
      fileHashes[rel] = hash;
      combined += rel + ':' + hash + ';';
    }
  }

  const contentHash = createHash('sha256').update(combined || profileId).digest('hex');

  let lastModified = 0;
  try {
    const stat = await fs.stat(browserDataDir);
    lastModified = stat.mtimeMs;
  } catch {
    lastModified = Date.now();
  }

  return { profileId, contentHash, lastModified, syncVersion, fileHashes };
}

async function hashPath(target: string): Promise<string | null> {
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(target, { withFileTypes: true });
      let combined = '';
      for (const entry of entries) {
        const childHash = await hashPath(path.join(target, entry.name));
        if (childHash) combined += entry.name + ':' + childHash + ';';
      }
      return combined ? createHash('sha256').update(combined).digest('hex') : null;
    }
    const data = await fs.readFile(target);
    return createHash('sha256').update(data).digest('hex');
  } catch {
    return null;
  }
}

export async function hasProfileChanged(
  browserDataDir: string,
  previous: ProfileSyncMeta | null,
): Promise<boolean> {
  if (!previous) return true;
  const current = await computeProfileSyncMeta(previous.profileId, browserDataDir, previous.syncVersion);
  return current.contentHash !== previous.contentHash;
}

export async function saveSyncMeta(metaPath: string, meta: ProfileSyncMeta): Promise<void> {
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
}

export async function loadSyncMeta(metaPath: string): Promise<ProfileSyncMeta | null> {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(raw) as ProfileSyncMeta;
  } catch {
    return null;
  }
}

export function getSyncMetaPath(dataDir: string, profileId: string): string {
  return path.join(dataDir, 'profiles', profileId, 'sync-meta.json');
}
