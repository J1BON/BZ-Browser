/**
 * Full platform audit: Win / Mac / Android / iOS
 * — fingerprint device + UA coherence, resolution, anti-detect health, search seed, kernel flags.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { createProfile } from '../src/core/fingerprint/generator.js';
import { seedProfileSearchEngine } from '../src/core/browser/prefs-seed.js';
import { buildKernelFingerprintArgs } from '../src/core/fingerprint/injection.js';
import { buildCanonicalFingerprint } from '../src/core/fingerprint/canonical-fingerprint.js';
import { assessFingerprintHealth } from '../src/utils/fp-health.js';
import { resolveOsConfig, OS_TEMPLATE_MAP } from '../src/utils/os-templates.js';
import { isIosOnChromium } from '../src/core/fingerprint/canonical-fingerprint.js';
import type { BrowserProfile } from '../src/types/profile.js';

const PLATFORMS = ['Windows', 'MacOS', 'Android', 'iOS'] as const;

const UA_CHECKS: Record<string, RegExp> = {
  Windows: /Windows NT/i,
  MacOS: /Macintosh|Mac OS X/i,
  Android: /Android/i,
  iOS: /iPhone|iPad|CriOS|CPU (iPhone )?OS/i,
};

function auditProfile(profile: BrowserProfile, platform: string, resolution?: { w: number; h: number }): void {
  const fp = profile.fingerprint;
  const label = `[${platform}]`;

  assert.equal(fp.device, OS_TEMPLATE_MAP[platform].device, `${label} device mismatch`);

  const uaCheck = UA_CHECKS[platform];
  assert.ok(uaCheck.test(fp.userAgent), `${label} UA failed: ${fp.userAgent.slice(0, 100)}`);

  // Resolution
  const sw = fp.screenWidth ?? fp.windowWidth;
  const sh = fp.screenHeight ?? fp.windowHeight;
  assert.ok(sw >= 320 && sh >= 480, `${label} screen too small: ${sw}x${sh}`);
  assert.ok(fp.windowWidth <= sw, `${label} window wider than screen`);
  assert.ok(fp.windowHeight <= sh, `${label} window taller than screen`);

  if (resolution) {
    assert.equal(sw, resolution.w, `${label} screen width`);
    assert.equal(sh, resolution.h, `${label} screen height`);
  }

  // Anti-detect defaults
  assert.notEqual(fp.webRTC, '1', `${label} WebRTC must not be Real (leaks IP)`);
  assert.equal(fp.canvas, '2', `${label} canvas should be noise`);
  assert.equal(fp.webGlImage, '2', `${label} WebGL image should be noise`);

  if (platform === 'Android' || platform === 'iOS') {
    assert.equal(fp.formFactor, 'mobile', `${label} must be mobile form factor`);
    assert.ok((fp.touchPoints ?? 0) >= 1, `${label} touch points`);
  }

  const health = assessFingerprintHealth(profile);
  const hardErrors = health.issues.filter((i) => i.severity === 'error');
  assert.equal(hardErrors.length, 0, `${label} health errors: ${hardErrors.map((e) => e.message).join('; ')}`);
  assert.ok(health.score >= 75, `${label} health score ${health.score} too low`);

  // Kernel flags (desktop only)
  if (platform === 'Windows' || platform === 'MacOS') {
    const cf = buildCanonicalFingerprint(fp, profile.fingerprintId);
    const kArgs = buildKernelFingerprintArgs(cf, fp);
    const expected = platform === 'Windows' ? '--fingerprint-platform=windows' : '--fingerprint-platform=macos';
    assert.ok(kArgs.some((a) => a === expected), `${label} missing kernel platform flag`);
    assert.ok(kArgs.some((a) => a.startsWith('--timezone=')), `${label} missing timezone kernel flag`);
  }

  console.log(`  ✓ ${platform}: device=${fp.device} ${sw}x${sh} health=${health.score}% webRTC=${fp.webRTC}`);
}

async function testSearchSeed(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bz-plat-'));
  await seedProfileSearchEngine(tmp, { force: true });
  const raw = await fs.readFile(path.join(tmp, 'Default', 'Preferences'), 'utf-8');
  const prefs = JSON.parse(raw) as { default_search_provider_data?: { template_url_data?: { url?: string; prepopulate_id?: number } } };
  const t = prefs.default_search_provider_data?.template_url_data;
  assert.ok(t?.url?.includes('{searchTerms}'), 'search URL missing');
  assert.equal(t?.prepopulate_id, 0, 'must use custom search engine');
  await fs.rm(tmp, { recursive: true, force: true });
  console.log('  ✓ Search engine prefs seed OK');
}

function testIosLaunchAllowed(): void {
  const ios = createFromTemplate('iphone-17', 'iOS Test');
  assert.ok(/CriOS|Chrome/i.test(ios.fingerprint.userAgent), `iOS should use Chrome UA, got: ${ios.fingerprint.userAgent.slice(0, 80)}`);
  assert.ok(!isIosOnChromium(ios.fingerprint), 'Chrome-iOS UA must be launchable');
}

async function main(): Promise<void> {
  console.log('Platform audit:\n');

  for (const platform of PLATFORMS) {
    const cfg = resolveOsConfig(platform);
    const profile = createFromTemplate(cfg.templateId, `Audit ${platform}`);
    auditProfile(profile, platform);
  }

  // Custom resolution (1920x1080) on Windows
  const winProfile = createProfile('Win 1080p', undefined, {
    formFactor: 'desktop',
    device: 'Windows',
    resolution: { width: 1920, height: 1080 },
  });
  auditProfile(winProfile, 'Windows', { w: 1920, h: 1080 });

  await testSearchSeed();
  testIosLaunchAllowed();

  console.log('\ntest-all-platforms: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
