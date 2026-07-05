import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ChromiumInfo {
  path: string;
  source: 'fingerprint-chromium' | 'broearn' | 'chrome' | 'env';
  version?: string;
}

export interface ChromiumStatus {
  installed: boolean;
  path: string | null;
  source: ChromiumInfo['source'] | null;
  isPatched: boolean;
  tlsReady: boolean;
  version: string | null;
  installDir: string;
}

export function getDefaultChromiumInstallDir(): string {
  return path.join(process.env.LOCALAPPDATA ?? '', 'CloudAntidetect', 'chromium');
}

export function getChromiumExecutableName(): string {
  if (process.platform === 'win32') return 'chrome.exe';
  if (process.platform === 'darwin') return 'Google Chrome for Testing';
  return 'chrome';
}

let bundledResourcesPath: string | null = null;

/** Called from Electron main on startup when app is packaged */
export function setBundledResourcesPath(resourcesPath: string): void {
  bundledResourcesPath = resourcesPath;
}

function getBundledChromiumPath(): string | undefined {
  if (!bundledResourcesPath) return undefined;
  const bundled = path.join(bundledResourcesPath, 'chromium', getChromiumExecutableName());
  return exists(bundled) ? bundled : undefined;
}

function buildCandidatePaths(): (string | undefined)[] {
  const installDir = getDefaultChromiumInstallDir();
  const exeName = getChromiumExecutableName();

  return [
    getBundledChromiumPath(),
    process.env.FINGERPRINT_CHROMIUM_PATH,
    path.join(installDir, exeName),
    process.env.CHROME_PATH,
    path.join(process.env.LOCALAPPDATA ?? '', 'BroearnBrowser', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'BroearnBrowser', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
}

function exists(p: string | undefined): p is string {
  if (!p) return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function classify(pathStr: string): ChromiumInfo['source'] {
  const lower = pathStr.toLowerCase();
  if (lower.includes('resources\\chromium') || lower.includes('resources/chromium')) return 'fingerprint-chromium';
  if (lower.includes('fingerprint') || lower.includes('cloudantidetect\\chromium')) return 'fingerprint-chromium';
  if (lower.includes('broearn')) return 'broearn';
  if (process.env.FINGERPRINT_CHROMIUM_PATH && pathStr === process.env.FINGERPRINT_CHROMIUM_PATH) return 'fingerprint-chromium';
  if (process.env.CHROME_PATH && pathStr === process.env.CHROME_PATH) return 'env';
  return 'chrome';
}

export function isPatchedSource(source: ChromiumInfo['source'] | null | undefined): boolean {
  return source === 'fingerprint-chromium' || source === 'broearn' || source === 'env';
}

async function probeVersion(chromePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(chromePath, ['--version']);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

export function resolveChromium(): ChromiumInfo | null {
  for (const candidate of buildCandidatePaths()) {
    if (exists(candidate)) {
      return { path: candidate, source: classify(candidate) };
    }
  }

  if (process.platform === 'darwin') {
    const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (exists(macPath)) return { path: macPath, source: 'chrome' };
  }

  if (process.platform === 'linux') {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']) {
      if (exists(p)) return { path: p, source: 'chrome' };
    }
  }

  return null;
}

export async function getChromiumStatus(): Promise<ChromiumStatus> {
  const info = resolveChromium();
  const version = info ? await probeVersion(info.path) : undefined;
  if (info && version) info.version = version;

  return {
    installed: !!info,
    path: info?.path ?? null,
    source: info?.source ?? null,
    isPatched: isPatchedSource(info?.source),
    tlsReady: isPatchedSource(info?.source),
    version: version ?? null,
    installDir: getDefaultChromiumInstallDir(),
  };
}

export function checkTlsReadiness(sslFingerprint: string, source: ChromiumInfo['source'] | null): {
  ready: boolean;
  warning?: string;
} {
  if (sslFingerprint === '1') {
    return { ready: true };
  }
  if (isPatchedSource(source)) {
    return { ready: true };
  }
  return {
    ready: false,
    warning: 'TLS/JA3 spoofing requires patched Chromium. Install via Settings → "Install Patched Chromium" or set FINGERPRINT_CHROMIUM_PATH.',
  };
}

export function getChromiumInstallHint(): string {
  return [
    'Install patched Chromium for TLS/JA3 protection:',
    `  ${path.join(getDefaultChromiumInstallDir(), getChromiumExecutableName())}`,
    'Use Settings → Install Patched Chromium, or set FINGERPRINT_CHROMIUM_PATH.',
    'Download: https://github.com/adium/fingerprint-chromium/releases',
  ].join('\n');
}
