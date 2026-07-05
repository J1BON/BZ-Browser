import fs from 'fs/promises';
import path from 'path';

function chromiumInstallDir(): string {
  return path.join(process.env.LOCALAPPDATA ?? '', 'CloudAntidetect', 'chromium');
}

/** Pinned fingerprint-chromium release — bump when validating a new upstream build. */
export const CHROMIUM_MANIFEST = {
  repo: 'adium/fingerprint-chromium',
  /** GitHub release tag tested against this app version. */
  pinnedTag: '131.0.6778.204-1',
  /** SHA-256 of the Windows zip asset at pinnedTag (verify on install when platform matches). */
  assetSha256: {
    win: '',
  },
  releasesUrl: 'https://github.com/adium/fingerprint-chromium/releases',
} as const;

export interface ChromiumInstallRecord {
  tag: string;
  version: string;
  installedAt: number;
  path: string;
}

export interface ChromiumVersionCheck {
  upToDate: boolean;
  installedTag: string | null;
  installedVersion: string | null;
  pinnedTag: string;
  latestTag: string | null;
  warning?: string;
}

export async function fetchLatestChromiumTag(): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${CHROMIUM_MANIFEST.repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CloudAntidetectBrowser' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  }
}

export function compareChromiumTags(installed: string | null, pinned: string): boolean {
  if (!installed) return false;
  return installed === pinned;
}

function installRecordPath(installDir: string): string {
  return path.join(installDir, 'chromium-install.json');
}

export async function readChromiumInstallRecord(installDir = chromiumInstallDir()): Promise<ChromiumInstallRecord | null> {
  try {
    const raw = await fs.readFile(installRecordPath(installDir), 'utf-8');
    return JSON.parse(raw) as ChromiumInstallRecord;
  } catch {
    return null;
  }
}

export async function writeChromiumInstallRecord(installDir: string, record: ChromiumInstallRecord): Promise<void> {
  await fs.writeFile(installRecordPath(installDir), JSON.stringify(record, null, 2));
}
