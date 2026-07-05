import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import extract from 'extract-zip';
import {
  getDefaultChromiumInstallDir,
  getChromiumExecutableName,
  resolveChromium,
} from './chromium-resolver.js';

const execFileAsync = promisify(execFile);

const GITHUB_REPO = 'adium/fingerprint-chromium';

export interface ChromiumInstallResult {
  success: boolean;
  path?: string;
  version?: string;
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

async function getLatestReleaseAsset(): Promise<{ url: string; name: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CloudAntidetectBrowser' },
  });
  if (!res.ok) return null;
  const data = await res.json() as {
    assets: { name: string; browser_download_url: string }[];
  };

  const platform = process.platform;
  const asset = data.assets.find((a) => {
    const n = a.name.toLowerCase();
    if (platform === 'win32') return n.includes('win') && (n.endsWith('.zip') || n.endsWith('.7z'));
    if (platform === 'darwin') return (n.includes('mac') || n.includes('darwin')) && n.endsWith('.zip');
    if (platform === 'linux') return n.includes('linux') && n.endsWith('.zip');
    return false;
  });

  return asset ? { url: asset.browser_download_url, name: asset.name } : null;
}

async function copyBroearnChromium(installDir: string): Promise<string | null> {
  const broearnPaths = [
    path.join(process.env.LOCALAPPDATA ?? '', 'BroearnBrowser', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'BroearnBrowser', 'Application', 'chrome.exe'),
  ];
  for (const src of broearnPaths) {
    if (!fs.existsSync(src)) continue;
    await fsPromises.mkdir(installDir, { recursive: true });
    const dest = path.join(installDir, getChromiumExecutableName());
    await fsPromises.copyFile(src, dest);
    return dest;
  }
  return null;
}

export async function installPatchedChromium(
  onProgress?: (msg: string) => void,
): Promise<ChromiumInstallResult> {
  const installDir = getDefaultChromiumInstallDir();
  await fsPromises.mkdir(installDir, { recursive: true });

  onProgress?.('Checking for Broearn patched Chromium...');
  const broearnCopy = await copyBroearnChromium(installDir);
  if (broearnCopy) {
    onProgress?.('Copied Broearn patched Chromium');
    return { success: true, path: broearnCopy };
  }

  onProgress?.('Fetching latest fingerprint-chromium release...');
  const asset = await getLatestReleaseAsset();
  if (!asset) {
    return {
      success: false,
      error: `No release asset found for ${process.platform}. Download manually from https://github.com/${GITHUB_REPO}/releases`,
    };
  }

  if (!asset.name.endsWith('.zip')) {
    return {
      success: false,
      error: `Unsupported archive format: ${asset.name}. Extract manually to ${installDir}`,
    };
  }

  const tmpZip = path.join(installDir, asset.name);
  onProgress?.(`Downloading ${asset.name}...`);
  const res = await fetch(asset.url);
  if (!res.ok) {
    return { success: false, error: `Download failed: HTTP ${res.status}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fsPromises.writeFile(tmpZip, buf);

  const extractDir = path.join(installDir, '_extract');
  await fsPromises.rm(extractDir, { recursive: true, force: true });
  await fsPromises.mkdir(extractDir, { recursive: true });

  onProgress?.('Extracting...');
  await extract(tmpZip, { dir: extractDir });
  await fsPromises.unlink(tmpZip).catch(() => {});

  const chromeExe = await findChromeExe(extractDir);
  if (!chromeExe) {
    return { success: false, error: 'chrome.exe not found in downloaded archive' };
  }

  const dest = path.join(installDir, getChromiumExecutableName());
  await fsPromises.copyFile(chromeExe, dest);

  // Copy adjacent DLLs/resources
  const chromeDir = path.dirname(chromeExe);
  const siblings = await fsPromises.readdir(chromeDir);
  for (const s of siblings) {
    const src = path.join(chromeDir, s);
    const stat = await fsPromises.stat(src);
    if (stat.isFile()) {
      await fsPromises.copyFile(src, path.join(installDir, s)).catch(() => {});
    }
  }

  await fsPromises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  onProgress?.('Patched Chromium installed');

  let version: string | undefined;
  try {
    const { stdout } = await execFileAsync(dest, ['--version']);
    version = stdout.trim();
  } catch {
    // ignore
  }

  return { success: true, path: dest, version };
}

export async function getChromiumInstallStatus() {
  const info = resolveChromium();
  const installDir = getDefaultChromiumInstallDir();
  const installedAtDefault = fs.existsSync(path.join(installDir, getChromiumExecutableName()));
  return {
    installed: !!info,
    path: info?.path ?? null,
    source: info?.source ?? null,
    isPatched: info ? info.source !== 'chrome' : false,
    tlsReady: info ? info.source !== 'chrome' : false,
    version: info?.version ?? null,
    installDir,
    installedAtDefault,
  };
}
