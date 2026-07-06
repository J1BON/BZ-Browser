/**
 * Launch smoke test for Win / Mac / Android / iOS templates.
 * Creates ephemeral profiles, launches each briefly, verifies success.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { seedProfileSearchEngine } from '../src/core/browser/prefs-seed.js';
import { resolveOsConfig } from '../src/utils/os-templates.js';

const PLATFORMS = ['Windows', 'MacOS', 'Android', 'iOS'] as const;
const dataDir = path.join(os.tmpdir(), `bz-launch-test-${Date.now()}`);

const store = new ProfileStore(dataDir);
await store.init();
const launcher = new BrowserLauncher();

for (const platform of PLATFORMS) {
  const cfg = resolveOsConfig(platform);
  const profile = createFromTemplate(cfg.templateId, `LaunchTest ${platform}`);
  await store.save(profile);

  const userDataDir = path.join(dataDir, 'profiles', profile.id, 'browser-data');
  await fs.mkdir(userDataDir, { recursive: true });
  await seedProfileSearchEngine(userDataDir, { force: true });

  const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
  const prefsRaw = await fs.readFile(prefsPath, 'utf-8');
  const prefs = JSON.parse(prefsRaw) as { default_search_provider_data?: { template_url_data?: { url?: string } } };
  assert.ok(prefs.default_search_provider_data?.template_url_data?.url?.includes('{searchTerms}'),
    `${platform}: search prefs missing before launch`);

  console.log(`Launching ${platform} (${profile.fingerprint.device}) ${profile.fingerprint.windowWidth}x${profile.fingerprint.windowHeight}…`);
  const result = await launcher.launch(profile, dataDir);
  assert.ok(result.success, `${platform} launch failed: ${result.error ?? 'unknown'}`);
  await launcher.close(profile.id);
  console.log(`  ✓ ${platform} launch OK`);
}

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
console.log('\ntest-launch-platforms: all passed');
