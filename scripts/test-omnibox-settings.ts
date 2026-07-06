/**
 * Verifies headed launch: Google search baked into profile (no --load-extension banner).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { resolveChromium } from '../src/core/fingerprint/chromium-resolver.js';
import { BUNDLED_SEARCH_EXTENSION_ID } from '../src/core/browser/search-setup.js';

if (!resolveChromium()) {
  console.log('SKIP: patched Chromium not installed');
  process.exit(0);
}

const dataDir = path.join(os.tmpdir(), `bz-omnibox-settings-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const profile = createFromTemplate('win-desktop', 'OmniboxSettings');
profile.headless = false;
await store.save(profile);

const extDir = path.join(
  dataDir, 'profiles', profile.id, 'browser-data', 'Default', 'Extensions', BUNDLED_SEARCH_EXTENSION_ID,
);
assert.ok(await fs.access(extDir).then(() => true).catch(() => false), 'extension should be baked at profile create');

const launcher = new BrowserLauncher();
const result = await launcher.launch(profile, dataDir, undefined, {
  displaySize: { width: 1920, height: 1080 },
});
assert.ok(result.success, `launch failed: ${result.error ?? 'unknown'}`);

const ctx = launcher.getContext(profile.id)!;
const page = await ctx.newPage();
await page.goto('chrome://version', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
const versionText = await page.evaluate(() => document.body?.innerText ?? '');
assert.ok(
  !versionText.toLowerCase().includes('--load-extension'),
  'must not use --load-extension (causes hijack popup)',
);
console.log('No --load-extension in command line: OK');

const prefsPath = path.join(dataDir, 'profiles', profile.id, 'browser-data', 'Default', 'Preferences');
const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf-8')) as {
  default_search_provider?: { enabled?: boolean; name?: string; search_url?: string };
  extensions?: { settings?: Record<string, { state?: number }> };
};
assert.equal(prefs.default_search_provider?.enabled, true);
assert.equal(prefs.default_search_provider?.name, 'Google');
assert.equal(prefs.extensions?.settings?.[BUNDLED_SEARCH_EXTENSION_ID]?.state, 1, 'baked extension enabled');

await launcher.close(profile.id);
await new Promise((r) => setTimeout(r, 600));

const webDataPath = path.join(dataDir, 'profiles', profile.id, 'browser-data', 'Default', 'Web Data');
const db = new DatabaseSync(webDataPath, { readOnly: true });
const google = db.prepare('SELECT short_name, is_active FROM keywords WHERE short_name = ?').get('Google') as
  | { short_name: string; is_active: number }
  | undefined;
db.close();
assert.equal(google?.is_active, 1);

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
console.log('test-omnibox-settings: passed');
