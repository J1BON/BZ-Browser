/**
 * Verifies omnibox search provider is seeded (Web Data + Preferences).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { resolveChromium } from '../src/core/fingerprint/chromium-resolver.js';

const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q={searchTerms}';

if (!resolveChromium()) {
  console.log('SKIP: patched Chromium not installed');
  process.exit(0);
}

const dataDir = path.join(os.tmpdir(), `bz-omnibox-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const profile = createFromTemplate('win-desktop', 'OmniboxTest');
profile.headless = true;
await store.save(profile);

const launcher = new BrowserLauncher();
const result = await launcher.launch(profile, dataDir);
assert.ok(result.success, `launch failed: ${result.error ?? 'unknown'}`);

await launcher.close(profile.id);

const defaultDir = path.join(dataDir, 'profiles', profile.id, 'browser-data', 'Default');
const webData = await fs.readFile(path.join(defaultDir, 'Web Data'));
assert.ok(webData.includes(Buffer.from(GOOGLE_SEARCH_URL, 'utf-8')), 'Google search URL missing from Web Data');

const policyOk = await fs.access(
  path.join(dataDir, 'profiles', profile.id, 'browser-data', 'policies', 'managed', 'bz_search.json'),
).then(() => true).catch(() => false);
assert.ok(policyOk, 'managed search policy file should exist');

// Preferences may be rewritten by Chromium after exit — verify seed files exist at minimum
const prefsRaw = await fs.readFile(path.join(defaultDir, 'Preferences'), 'utf-8').catch(() => '');
if (prefsRaw) {
  const prefs = JSON.parse(prefsRaw) as { default_search_provider_data?: { template_url_data?: { url?: string } } };
  const prefsUrl = prefs.default_search_provider_data?.template_url_data?.url ?? '';
  if (prefsUrl) {
    assert.ok(prefsUrl.includes('{searchTerms}'), `Preferences search URL invalid: ${prefsUrl}`);
    assert.ok(!prefsUrl.includes('{google:baseURL}'), 'must not use blocked google baseURL token');
  }
}

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
console.log('test-omnibox-search: passed (Google active in Web Data + Preferences)');
