/**
 * End-to-end smoke: launch profile, ip8.com tab, maximized args, search seeds.
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
import { buildLaunchArgs } from '../src/core/fingerprint/injection.js';
import { resolveStartupUrls, DEFAULT_STARTUP_URL } from '../src/constants/startup.js';
import { shouldMaximizeLaunchWindow } from '../src/utils/resolution.js';

const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q={searchTerms}';

if (!resolveChromium()) {
  console.log('SKIP: patched Chromium not installed');
  process.exit(0);
}

const dataDir = path.join(os.tmpdir(), `bz-smoke-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const profile = createFromTemplate('win-desktop', 'SmokeTest');
profile.headless = true;
profile.openUrls = [];
await store.save(profile);

assert.deepEqual(resolveStartupUrls(profile.openUrls), [DEFAULT_STARTUP_URL], 'default startup URL');

const launchArgs = buildLaunchArgs(profile, profile.fingerprintId, {
  launchSize: { width: 1920, height: 1080 },
  maximize: shouldMaximizeLaunchWindow(profile.fingerprint),
});
assert.ok(launchArgs.includes('--start-maximized'), 'desktop must use --start-maximized');
assert.ok(!launchArgs.some((a) => a.startsWith('--window-size=')), 'maximized launch must not set --window-size');

const launcher = new BrowserLauncher();
console.log('Launching profile…');
const result = await launcher.launch(profile, dataDir, undefined, {
  displaySize: { width: 1920, height: 1080 },
});
assert.ok(result.success, `launch failed: ${result.error ?? 'unknown'}`);

const context = launcher.getContext(profile.id);
assert.ok(context, 'browser context should be running');

const pages = context!.pages();
assert.ok(pages.length >= 1, 'should have at least one tab');

let startupUrl = '';
for (let i = 0; i < 30; i++) {
  startupUrl = pages[0]?.url() ?? '';
  if (startupUrl.includes('ip8.com')) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('Startup tab URL:', startupUrl);
assert.ok(startupUrl.includes('ip8.com'), `expected ip8.com tab, got: ${startupUrl}`);

await launcher.close(profile.id);

const webDataPath = path.join(dataDir, 'profiles', profile.id, 'browser-data', 'Default', 'Web Data');
const db = new DatabaseSync(webDataPath, { readOnly: true });
const row = db.prepare(
  'SELECT short_name, is_active, url FROM keywords WHERE url LIKE ? LIMIT 1',
).get('%google.com/search%') as { short_name: string; is_active: number; url: string } | undefined;
const all = db.prepare('SELECT short_name, is_active FROM keywords').all();
db.close();
console.log('Web Data keywords:', all);
assert.ok(row, 'Google keyword missing from Web Data');
assert.equal(row!.is_active, 1, `Google keyword must be active, got is_active=${row!.is_active}`);
assert.ok(row!.url.includes('{searchTerms}'), `bad search URL: ${row!.url}`);

const webData = await fs.readFile(webDataPath);
assert.ok(webData.includes(Buffer.from(GOOGLE_SEARCH_URL, 'utf-8')), 'Google search URL missing from Web Data bytes');

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
console.log('test-launch-smoke: all passed');
