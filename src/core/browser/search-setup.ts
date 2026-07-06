import fs from 'fs/promises';
import path from 'path';
import { resolveBrowserAsset } from './bundled-assets.js';
import { seedProfileSearchEngine } from './prefs-seed.js';
import { applySystemChromiumSearchPolicy, writeUserDataSearchPolicy } from './search-policy.js';
import { seedWebDataSearchEngine, verifyWebDataSeeded } from './web-data-seed.js';

/** Stable ID from manifest "key" — baked into every profile (not --load-extension). */
export const BUNDLED_SEARCH_EXTENSION_ID = 'ekgaihgjolbkagonhbpkhckpflakbeeb';
const SEARCH_EXT_VERSION = '1.0.3';

export function profileBrowserDataDir(dataDir: string, profileId: string): string {
  return path.join(dataDir, 'profiles', profileId, 'browser-data');
}

async function wipeWebData(defaultDir: string): Promise<void> {
  const webDataPath = path.join(defaultDir, 'Web Data');
  await fs.rm(webDataPath, { force: true }).catch(() => {});
  await fs.rm(`${webDataPath}-journal`, { force: true }).catch(() => {});
  await fs.rm(`${webDataPath}-wal`, { force: true }).catch(() => {});
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Copy bundled search component into the profile Extensions folder (MoreLogin-style). */
async function installBundledSearchExtension(userDataDir: string): Promise<string> {
  const src = resolveBrowserAsset('search-extension');
  const manifest = JSON.parse(await fs.readFile(path.join(src, 'manifest.json'), 'utf-8')) as {
    version?: string;
    name?: string;
  };
  const version = manifest.version ?? SEARCH_EXT_VERSION;
  const dest = path.join(userDataDir, 'Default', 'Extensions', BUNDLED_SEARCH_EXTENSION_ID, version);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true, force: true });
  return dest;
}

/** Register the baked extension in Preferences so Chromium loads it without --load-extension. */
async function registerBundledSearchExtension(userDataDir: string, extPath: string): Promise<void> {
  const prefsFile = path.join(userDataDir, 'Default', 'Preferences');
  const prefs = await readJson(prefsFile);
  const manifest = JSON.parse(await fs.readFile(path.join(extPath, 'manifest.json'), 'utf-8')) as Record<string, unknown>;

  const extensions = { ...(prefs.extensions as Record<string, unknown> ?? {}) };
  const settings = { ...(extensions.settings as Record<string, unknown> ?? {}) };

  settings[BUNDLED_SEARCH_EXTENSION_ID] = {
    account_extension_type: 0,
    active_permissions: { api: [], explicit_host: [], manifest_permissions: [] },
    creation_flags: 38,
    from_webstore: false,
    granted_permissions: { api: [], explicit_host: [], manifest_permissions: [] },
    incognito: true,
    incognito_content_settings: [],
    location: 4,
    manifest,
    path: extPath.replace(/\\/g, '/'),
    state: 1,
    was_installed_by_default: true,
    was_installed_by_oem: true,
    install_time: String(Date.now() * 1000),
    update_time: String(Date.now() * 1000),
  };

  extensions.settings = settings;
  extensions.alerts = { initialized: true };
  extensions.ui = { ...(extensions.ui as Record<string, unknown> ?? {}), developer_mode: false };
  prefs.extensions = extensions;

  await fs.mkdir(path.dirname(prefsFile), { recursive: true });
  await fs.writeFile(prefsFile, JSON.stringify(prefs), 'utf-8');
}

async function writeSearchProfile(userDataDir: string): Promise<void> {
  await applySystemChromiumSearchPolicy();
  await writeUserDataSearchPolicy(userDataDir);
  await seedProfileSearchEngine(userDataDir, { force: true });

  const defaultDir = path.join(userDataDir, 'Default');
  await wipeWebData(defaultDir);
  await seedWebDataSearchEngine(defaultDir);
  await verifyWebDataSeeded(defaultDir);

  const extPath = await installBundledSearchExtension(userDataDir);
  await registerBundledSearchExtension(userDataDir, extPath);
}

export async function seedNewProfileSearch(dataDir: string, profileId: string): Promise<void> {
  const userDataDir = profileBrowserDataDir(dataDir, profileId);
  await fs.mkdir(path.join(userDataDir, 'Default'), { recursive: true });
  await writeSearchProfile(userDataDir);
}

/** Full search bake before every launch — ungoogled builds lose omnibox search without this. */
export async function ensureProfileSearchReady(userDataDir: string): Promise<void> {
  await fs.mkdir(path.join(userDataDir, 'Default'), { recursive: true });
  await writeSearchProfile(userDataDir);
}

export async function ensureChromiumInstallSearchDefaults(chromiumExePath: string): Promise<void> {
  const exeDir = path.dirname(chromiumExePath);
  const payload = JSON.stringify({
    distribution: {
      show_welcome_page: false,
      skip_first_run_ui: true,
      make_chrome_default: false,
    },
    default_search_provider_data: {
      template_url_data: {
        short_name: 'Google',
        keyword: 'google.com',
        url: 'https://www.google.com/search?q={searchTerms}',
        suggestions_url: 'https://www.google.com/complete/search?client=chrome&q={searchTerms}',
        favicon_url: 'https://www.google.com/favicon.ico',
        safe_for_autoreplace: true,
        prepopulate_id: 0,
        id: 1000,
        is_active: 1,
      },
    },
  }, null, 2);

  for (const name of ['initial_preferences', 'master_preferences']) {
    const file = path.join(exeDir, name);
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, payload, 'utf-8').catch(() => {});
    }
  }
}
