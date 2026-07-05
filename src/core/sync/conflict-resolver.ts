import type { BrowserProfile, ConflictResolution } from '../../types/profile.js';
import type { ProfileSyncMeta } from './incremental.js';

export type { ConflictResolution };

export interface SyncConflict {
  profileId: string;
  profileName: string;
  localVersion: number;
  remoteVersion: number;
  localModified: number;
  remoteModified: number;
  localHash: string;
  remoteHash: string;
}

export interface ConflictResolutionResult {
  action: 'upload' | 'download' | 'skip' | 'conflict';
  conflict?: SyncConflict;
}

export function resolveSyncConflict(
  local: BrowserProfile,
  localMeta: ProfileSyncMeta | null,
  remote: BrowserProfile,
  remoteMeta: ProfileSyncMeta | null,
  resolution?: ConflictResolution,
): ConflictResolutionResult {
  const localModified = localMeta?.lastModified ?? local.lastOpened ?? local.createTime;
  const remoteModified = remoteMeta?.lastModified ?? remote.lastSynced ?? remote.createTime;
  const localHash = localMeta?.contentHash ?? '';
  const remoteHash = remoteMeta?.contentHash ?? '';

  if (localHash && remoteHash && localHash === remoteHash) {
    return { action: 'skip' };
  }

  const localOnly = !remoteMeta && !remote.lastSynced;
  const remoteOnly = !localMeta && !local.lastSynced;

  if (localOnly) return { action: 'upload' };
  if (remoteOnly) return { action: 'download' };

  const localNewer = localModified >= remoteModified && local.syncVersion >= remote.syncVersion;
  const remoteNewer = remoteModified > localModified || remote.syncVersion > local.syncVersion;

  if (localNewer && !remoteNewer) return { action: 'upload' };
  if (remoteNewer && !localNewer) return { action: 'download' };

  // Both modified — conflict
  const conflict: SyncConflict = {
    profileId: local.id,
    profileName: local.name,
    localVersion: local.syncVersion,
    remoteVersion: remote.syncVersion,
    localModified,
    remoteModified,
    localHash,
    remoteHash,
  };

  if (resolution === 'keep-local') return { action: 'upload', conflict };
  if (resolution === 'keep-remote') return { action: 'download', conflict };
  if (resolution === 'keep-newer') {
    return localModified >= remoteModified
      ? { action: 'upload', conflict }
      : { action: 'download', conflict };
  }

  return { action: 'conflict', conflict };
}

export function applyRemoteProfile(local: BrowserProfile, remote: BrowserProfile): BrowserProfile {
  return {
    ...remote,
    name: local.name,
    tags: [...new Set([...local.tags, ...remote.tags])],
    group: local.group ?? remote.group,
    color: local.color ?? remote.color,
    syncVersion: Math.max(local.syncVersion, remote.syncVersion) + 1,
    lastSynced: Date.now(),
  };
}

export function bumpSyncVersion(profile: BrowserProfile): BrowserProfile {
  return {
    ...profile,
    syncVersion: profile.syncVersion + 1,
    lastSynced: Date.now(),
  };
}
