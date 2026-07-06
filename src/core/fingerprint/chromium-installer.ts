import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import extract from 'extract-zip';
import {
  getDefaultChromiumInstallDir,
  getChromiumExecutableName,
  resolveChromium,
} from './chromium-resolver.js';
import {
  CHROMIUM_MANIFEST,
  fetchLatestChromiumTag,
  readChromiumInstallRecord,
  writeChromiumInstallRecord,
  type ChromiumVersionCheck,
} from './chromium-manifest.js';

const GITHUB_REPO = CHROMIUM_MANIFEST.repo;

function buildDirectAsset(tag: string): { url: string; name: string } | null {
  if (process.platform === 'win32') {
    const name = `ungoogled-chromium_${tag}-1.1_windows_x64.zip`;
    return {
      name,
      url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${name}`,
    };
  }
  if (process.platform === 'darwin') {
    const name = `ungoogled-chromium_${tag}-1.1_macos.dmg`;
    return {
      name,
      url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${name}`,
    };
  }
  if (process.platform === 'linux') {
    const name = `ungoogled-chromium-${tag}-1-x86_64_linux.tar.xz`;
    return {
      name,
      url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${name}`,
    };
  }
  return null;
}

async function getReleaseAsset(tag: string): Promise<{ url: string; name: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BZBrowser' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json() as {
        assets: { name: string; browser_download_url: string }[];
      };
      const picked = pickPlatformAsset(data.assets);
      if (picked) return picked;
    }
  } catch {
    // fall through to direct URL
  }
  return buildDirectAsset(tag);
}

function pickPlatformAsset(assets: { name: string; browser_download_url: string }[]): { url: string; name: string } | null {
  const platform = process.platform;
  const asset = assets.find((a) => {
    const n = a.name.toLowerCase();
    if (platform === 'win32') {
      return n.includes('windows_x64') && n.endsWith('.zip');
    }
    if (platform === 'darwin') {
      return (n.includes('macos') || n.includes('darwin')) && n.endsWith('.zip');
    }
    if (platform === 'linux') {
      return n.includes('linux') && n.endsWith('.zip');
    }
    return false;
  }) ?? assets.find((a) => {
    const n = a.name.toLowerCase();
    if (platform === 'win32') return n.includes('win') && (n.endsWith('.zip') || n.endsWith('.7z'));
    if (platform === 'darwin') return (n.includes('mac') || n.includes('darwin')) && n.endsWith('.zip');
    if (platform === 'linux') return n.includes('linux') && n.endsWith('.zip');
    return false;
  });
  return asset ? { url: asset.browser_download_url, name: asset.name } : null;
}

async function getLatestReleaseAsset(): Promise<{ url: string; name: string; tag: string } | null> {
  const pinned = await getReleaseAsset(CHROMIUM_MANIFEST.pinnedTag);
  if (pinned) return { ...pinned, tag: CHROMIUM_MANIFEST.pinnedTag };

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BZBrowser' },
  });
  if (!res.ok) return null;
  const data = await res.json() as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const asset = pickPlatformAsset(data.assets);
  return asset ? { ...asset, tag: data.tag_name } : null;
}

export interface ChromiumInstallResult {
  success: boolean;
  path?: string;
  version?: string;
  tag?: string;
  error?: string;
}

async function findChromeExe(dir: string): Promise<string | null> {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === getChromiumExecutableName().toLowerCase()) {
      return full;
    }
    if (entry.isDirectory()) {
      const found = await findChromeExe(full);
      if (found) return found;
    }
  }
  return null;
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

export async function installPatchedChromium(
  onProgress?: (msg: string) => void,
): Promise<ChromiumInstallResult> {
  const installDir = getDefaultChromiumInstallDir();
  await fsPromises.mkdir(installDir, { recursive: true });

  onProgress?.(`Fetching fingerprint-chromium ${CHROMIUM_MANIFEST.pinnedTag} (pinned)...`);
  const asset = await getLatestReleaseAsset();
  if (!asset) {
    return {
      success: false,
      error: `No release asset found for ${process.platform}. Download manually from ${CHROMIUM_MANIFEST.releasesUrl}`,
    };
  }

  if (!asset.name.endsWith('.zip')) {
    return {
      success: false,
      error: `Unsupported archive format: ${asset.name}. Extract manually to ${installDir}`,
    };
  }

  const tmpZip = path.join(os.tmpdir(), `bz-chromium-${asset.tag}.zip`);
  onProgress?.(`Downloading ${asset.name} (${asset.tag})...`);
  const res = await fetch(asset.url);
  if (!res.ok) {
    return { success: false, error: `Download failed: HTTP ${res.status}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fsPromises.writeFile(tmpZip, buf);

  const extractDir = path.join(os.tmpdir(), `bz-chromium-extract-${Date.now()}`);
  await fsPromises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  await fsPromises.mkdir(extractDir, { recursive: true });

  onProgress?.('Extracting...');
  await extract(tmpZip, { dir: extractDir });
  await fsPromises.unlink(tmpZip).catch(() => {});

  const chromeExe = await findChromeExe(extractDir);
  if (!chromeExe) {
    await fsPromises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    return { success: false, error: 'chrome.exe not found in downloaded archive' };
  }

  const chromeDir = path.dirname(chromeExe);
  const stagingDir = path.join(os.tmpdir(), `bz-chromium-staging-${Date.now()}`);
  await copyDirRecursive(chromeDir, stagingDir);
  await fsPromises.rm(installDir, { recursive: true, force: true }).catch(() => {});
  await fsPromises.mkdir(installDir, { recursive: true });
  await copyDirRecursive(stagingDir, installDir);
  await fsPromises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  await fsPromises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  onProgress?.('Patched Chromium installed');

  const dest = path.join(installDir, getChromiumExecutableName());
  if (!fs.existsSync(dest)) {
    return { success: false, error: 'chrome.exe missing after install copy' };
  }

  const localesDir = path.join(installDir, 'locales');
  const localeFiles = fs.existsSync(localesDir) ? fs.readdirSync(localesDir).filter((f) => f.endsWith('.pak')) : [];
  if (localeFiles.length === 0) {
    return { success: false, error: 'Chromium install incomplete (missing locale files). Try again.' };
  }

  // Use the pinned release tag as the version. Never run `chrome.exe --version`:
  // on Windows the patched fingerprint-chromium ignores it and opens a browser window.
  const version = asset.tag;

  await writeChromiumInstallRecord(installDir, {
    tag: asset.tag,
    version,
    installedAt: Date.now(),
    path: dest,
  });

  return { success: true, path: dest, version, tag: asset.tag };
}

export async function checkChromiumVersion(): Promise<ChromiumVersionCheck> {
  const installDir = getDefaultChromiumInstallDir();
  const record = await readChromiumInstallRecord(installDir);
  const latestTag = await fetchLatestChromiumTag();
  const pinnedTag = CHROMIUM_MANIFEST.pinnedTag;
  const installedTag = record?.tag ?? null;
  const upToDate = installedTag === pinnedTag;
  let warning: string | undefined;
  if (!installedTag) {
    warning = `No install record — re-install patched Chromium (pinned: ${pinnedTag}).`;
  } else if (!upToDate) {
    warning = `Installed Chromium tag ${installedTag} differs from pinned ${pinnedTag}. Update via Settings.`;
  } else if (latestTag && latestTag !== pinnedTag) {
    warning = `Upstream latest is ${latestTag}; app pins ${pinnedTag} until validated.`;
  }
  return {
    upToDate,
    installedTag,
    installedVersion: record?.version ?? null,
    pinnedTag,
    latestTag,
    warning,
  };
}

export async function getChromiumInstallStatus() {
  const info = resolveChromium();
  const installDir = getDefaultChromiumInstallDir();
  const installedAtDefault = fs.existsSync(path.join(installDir, getChromiumExecutableName()));
  return {
    installed: !!info,
    path: info?.path ?? null,
    source: info?.source ?? null,
    isPatched: info?.source === 'fingerprint-chromium',
    tlsReady: info?.source === 'fingerprint-chromium',
    version: info?.version ?? null,
    installDir,
    installedAtDefault,
  };
}
