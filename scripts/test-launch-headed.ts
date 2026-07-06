/**
 * Headed launch smoke — real Chromium window (spawn, not Playwright persistent context).
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

const dataDir = path.join(os.tmpdir(), `bz-headed-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const profile = createFromTemplate('win-desktop', 'HeadedSmoke');
profile.headless = false;
profile.openUrls = [];
await store.save(profile);

const launcher = new BrowserLauncher();
console.log('Headed launch…');
const result = await launcher.launch(profile, dataDir, undefined, {
  displaySize: { width: 1920, height: 1080 },
});
assert.ok(result.success, `headed launch failed: ${result.error ?? 'unknown'}`);

const ctx = launcher.getContext(profile.id);
assert.ok(ctx, 'context missing');
const url = ctx!.pages()[0]?.url() ?? '';
console.log('First tab:', url);
assert.ok(url.includes('ip8.com'), `expected ip8.com, got ${url}`);

await launcher.close(profile.id);
await new Promise((r) => setTimeout(r, 800));

const webDataPath = path.join(dataDir, 'profiles', profile.id, 'browser-data', 'Default', 'Web Data');
const db = new DatabaseSync(webDataPath, { readOnly: true });
const google = db.prepare(
  'SELECT short_name, is_active FROM keywords WHERE short_name = ?',
).get('Google') as { short_name: string; is_active: number } | undefined;
db.close();
assert.ok(google, 'Google keyword missing');
assert.equal(google!.is_active, 1, 'Google must be active');

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
console.log('test-launch-headed: passed');
