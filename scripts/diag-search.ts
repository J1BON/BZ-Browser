/**
 * Diagnose search extension load + prefs after launch.
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { resolveChromium } from '../src/core/fingerprint/chromium-resolver.js';
import { applySystemChromiumSearchPolicy } from '../src/core/browser/search-policy.js';

if (!resolveChromium()) {
  console.error('no chromium');
  process.exit(1);
}

await applySystemChromiumSearchPolicy();

const dataDir = path.join(os.tmpdir(), `bz-search-diag-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const profile = createFromTemplate('win-desktop', 'Diag');
await store.save(profile);

const launcher = new BrowserLauncher();
const result = await launcher.launch(profile, dataDir);
console.log('launch:', result.success, result.error ?? '');

const userDataDir = path.join(dataDir, 'profiles', profile.id, 'browser-data');
const prefs = JSON.parse(await fs.readFile(path.join(userDataDir, 'Default', 'Preferences'), 'utf-8'));
const extSettings = prefs.extensions?.settings ?? {};
const extIds = Object.keys(extSettings);
console.log('Extension IDs in prefs:', extIds.length ? extIds : '(none)');
for (const id of extIds) {
  const e = extSettings[id];
  console.log(' -', id, e?.path ?? e?.location, 'state=', e?.state);
}

const policyFile = path.join(userDataDir, 'policies', 'managed', 'bz_search.json');
console.log('managed policy file:', await fs.access(policyFile).then(() => 'yes').catch(() => 'no'));

const page = launcher.getContext(profile.id)?.pages()[0];
if (page) {
  await page.bringToFront();
  await page.waitForTimeout(800);
  await page.keyboard.press('Control+l');
  await page.keyboard.type('hi', { delay: 50 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  console.log('URL after typing hi:', page.url());
}

await launcher.close(profile.id);
await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
