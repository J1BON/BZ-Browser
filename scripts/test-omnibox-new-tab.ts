/**
 * Reproduces user flow: launch profile → new tab → verify Google is the active search provider.
 * Playwright cannot type into the omnibox over CDP; we verify runtime Preferences instead.
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

if (!resolveChromium()) {
  console.log('SKIP: patched Chromium not installed');
  process.exit(0);
}

const dataDir = path.join(os.tmpdir(), `bz-newtab-search-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const profile = createFromTemplate('win-desktop', 'NewTabSearch');
profile.headless = false;
await store.save(profile);

const launcher = new BrowserLauncher();
console.log('Launching headed profile…');
const result = await launcher.launch(profile, dataDir, undefined, {
  displaySize: { width: 1920, height: 1080 },
});
assert.ok(result.success, `launch failed: ${result.error ?? 'unknown'}`);

const ctx = launcher.getContext(profile.id)!;
const tab = await ctx.newPage();
await tab.bringToFront();
await tab.waitForTimeout(500);

const prefsPath = path.join(dataDir, 'profiles', profile.id, 'browser-data', 'Default', 'Preferences');
const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf-8')) as {
  default_search_provider?: { enabled?: boolean; name?: string; search_url?: string };
};
console.log('default_search_provider:', prefs.default_search_provider);

await launcher.close(profile.id);
await new Promise((r) => setTimeout(r, 600));

const webDataPath = path.join(dataDir, 'profiles', profile.id, 'browser-data', 'Default', 'Web Data');
const db = new DatabaseSync(webDataPath, { readOnly: true });
const google = db.prepare('SELECT short_name, is_active, enforced_by_policy FROM keywords WHERE short_name = ?').get('Google') as
  | { short_name: string; is_active: number; enforced_by_policy: number }
  | undefined;
db.close();

console.log('Google keyword after test:', google);

assert.equal(prefs.default_search_provider?.enabled, true, 'default_search_provider.enabled should be true');
assert.equal(prefs.default_search_provider?.name, 'Google', 'default search engine should be Google');
assert.ok(
  prefs.default_search_provider?.search_url?.includes('{searchTerms}'),
  'search URL must contain {searchTerms}',
);
assert.equal(google?.is_active, 1, 'Google keyword should stay active');

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
console.log('test-omnibox-new-tab: passed');
