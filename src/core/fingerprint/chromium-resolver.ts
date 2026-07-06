import fs from 'fs';
import path from 'path';
import { CHROMIUM_MANIFEST, readChromiumInstallRecord } from './chromium-manifest.js';

export interface ChromiumInfo {
  path: string;
  source: 'fingerprint-chromium' | 'env';
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
  pinnedTag?: string;
  installedTag?: string | null;
  chromiumUpdateWarning?: string;
}

export function getDefaultChromiumInstallDir(): string {
  return path.join(process.env.LOCALAPPDATA ?? '', 'BZBrowser', 'chromium');
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

  const patchedOnly: (string | undefined)[] = [
    getBundledChromiumPath(),
    process.env.FINGERPRINT_CHROMIUM_PATH,
    path.join(installDir, exeName),
  ];

  // Stock Chrome is never used for antidetect profiles unless explicitly opted in for dev.
  if (process.env.ALLOW_STOCK_CHROME === '1') {
    patchedOnly.push(
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  }

  return patchedOnly;
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
  if (lower.includes('fingerprint') || lower.includes('cloudantidetect\\chromium') || lower.includes('bzbrowser\\chromium')) return 'fingerprint-chromium';
  if (process.env.FINGERPRINT_CHROMIUM_PATH && pathStr === process.env.FINGERPRINT_CHROMIUM_PATH) return 'fingerprint-chromium';
  if (process.env.CHROME_PATH && pathStr === process.env.CHROME_PATH) return 'env';
  return 'fingerprint-chromium';
}

export function isPatchedSource(source: ChromiumInfo['source'] | null | undefined): boolean {
  return source === 'fingerprint-chromium' || source === 'env';
}

const versionCache = new Map<string, string>();
const VERSION_RE = /^(\d+\.\d+\.\d+\.\d+)$/;

/**
 * Resolve the Chromium version WITHOUT executing the browser.
 *
 * IMPORTANT: never run `chrome.exe --version` here. On Windows the patched
 * fingerprint-chromium ignores `--version` and instead launches a full browser
 * window, so calling it from the periodic status refresh spawned endless windows.
 * We read the version from the sidecar `<version>.manifest` file that ships next
 * to chrome.exe (and fall back to the install record / pinned tag).
 */
function resolveChromiumVersion(chromePath: string): string | undefined {
  const dir = path.dirname(chromePath);
  const cached = versionCache.get(dir);
  if (cached) return cached;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.manifest')) continue;
      const base = entry.slice(0, -'.manifest'.length);
      if (VERSION_RE.test(base)) {
        versionCache.set(dir, base);
        return base;
      }
    }
  } catch {
    /* ignore — fall through to undefined */
  }
  return undefined;
}

function isChromiumInstallComplete(chromeDir: string): boolean {
  const exe = path.join(chromeDir, getChromiumExecutableName());
  if (!exists(exe)) return false;
  const localesDir = path.join(chromeDir, 'locales');
  try {
    const localeFiles = fs.readdirSync(localesDir);
    return localeFiles.some((f) => f.endsWith('.pak'));
  } catch {
    return false;
  }
}

export function resolveChromium(): ChromiumInfo | null {
  for (const candidate of buildCandidatePaths()) {
    if (exists(candidate)) {
      const dir = path.dirname(candidate);
      if (!isChromiumInstallComplete(dir)) continue;
      return { path: candidate, source: classify(candidate) };
    }
  }

  if (process.platform === 'darwin') {
    const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (process.env.ALLOW_STOCK_CHROME === '1' && exists(macPath)) {
      return { path: macPath, source: 'env' };
    }
  }

  if (process.platform === 'linux' && process.env.ALLOW_STOCK_CHROME === '1') {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']) {
      if (exists(p)) return { path: p, source: 'env' };
    }
  }

  return null;
}

export async function getChromiumStatus(): Promise<ChromiumStatus> {
  const info = resolveChromium();

  const installDir = getDefaultChromiumInstallDir();
  const record = await readChromiumInstallRecord(installDir);

  // Derive version from the manifest sidecar / install record / pinned tag.
  // Never execute the browser here (see resolveChromiumVersion).
  const version = info
    ? resolveChromiumVersion(info.path) ?? record?.version ?? CHROMIUM_MANIFEST.pinnedTag
    : undefined;
  if (info && version) info.version = version;
  let chromiumUpdateWarning: string | undefined;
  if (isPatchedSource(info?.source) && record && record.tag !== CHROMIUM_MANIFEST.pinnedTag) {
    chromiumUpdateWarning = `Installed Chromium ${record.tag} — app pins ${CHROMIUM_MANIFEST.pinnedTag}. Re-install from Settings.`;
  }

  return {
    installed: !!info,
    path: info?.path ?? null,
    source: info?.source ?? null,
    isPatched: isPatchedSource(info?.source),
    tlsReady: isPatchedSource(info?.source),
    version: version ?? null,
    installDir,
    pinnedTag: CHROMIUM_MANIFEST.pinnedTag,
    installedTag: record?.tag ?? null,
    chromiumUpdateWarning,
  };
}

export function checkTlsReadiness(sslFingerprint: string, source: ChromiumInfo['source'] | null): {
  ready: boolean;
  warning?: string;
} {
  if (sslFingerprint === '1' && !isPatchedSource(source)) {
    return {
      ready: true,
      warning: 'Stock Chrome — JS spoofing is degraded; install fingerprint-chromium for production use.',
    };
  }
  if (isPatchedSource(source)) {
    return { ready: true };
  }
  return {
    ready: false,
    warning: 'Patched fingerprint-chromium is required. Install via Settings → "Install Patched Chromium" or set FINGERPRINT_CHROMIUM_PATH.',
  };
}

/** Antidetect profiles require the patched binary — stock Chrome is not supported for launch. */
export function requirePatchedChromium(source: ChromiumInfo['source'] | null): { ok: boolean; error?: string } {
  if (process.env.ALLOW_STOCK_CHROME === '1') {
    return { ok: true };
  }
  if (isPatchedSource(source)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: 'Patched fingerprint-chromium is required (stock Chrome is detectable). Install via Settings or set ALLOW_STOCK_CHROME=1 for dev only.',
  };
}

export function getChromiumInstallHint(): string {
  return [
    'No antidetect browser kernel found.',
    'Install patched Chromium (required — stock Google Chrome is NOT used):',
    `  Settings → Install Patched Chromium`,
    `  or: ${path.join(getDefaultChromiumInstallDir(), getChromiumExecutableName())}`,
    'Download: https://github.com/adryfish/fingerprint-chromium/releases',
  ].join('\n');
}
