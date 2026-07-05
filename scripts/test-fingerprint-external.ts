/**
 * Headful external fingerprint scoring (CreepJS / Sannysoft subset).
 * Requires Playwright Chromium; set ALLOW_STOCK_CHROME=1 for CI without patched binary.
 * Enable in .github/workflows/ci.yml when runners support headful validation.
 */
import { chromium } from 'playwright-core';
import { validateFingerprintQuickExternal } from '../src/core/fingerprint/external-validator.js';
import { buildFingerprintScript } from '../src/core/fingerprint/injection.js';
import type { FingerprintConfig } from '../src/types/profile.js';

const MIN_SCORE = Number(process.env.FP_MIN_SCORE ?? 70);

const fp: FingerprintConfig = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Safari/537.36',
  browserVersion: '131.0.6778.204',
  kernel: 'Chrome 131',
  device: 'Windows',
  formFactor: 'desktop',
  touchPoints: 0,
  osVersion: 'windows_10',
  tlsProfileId: 'chrome136-win',
  windowWidth: 1280,
  windowHeight: 720,
  screenLang: 'en-US',
  systemLang: 'en-US',
  timeZone: 'America/New_York',
  canvas: '2',
  webGlImage: '2',
  webGlMeta: '2',
  webGPU: '2',
  audioContext: '2',
  clientRects: '2',
  speechVoices: '2',
  mediaDevices: '2',
  webRTC: '2',
  fontEnable: '2',
  mac: '2',
  deviceName: '2',
  doNotTrack: '3',
  sslFingerprint: '2',
  portScanProtection: '1',
  hardwareAccelerate: '1',
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript({ content: buildFingerprintScript(fp, 'external-test-seed', '203.0.113.10') });
const page = await context.newPage();
await page.goto('about:blank');

const report = await validateFingerprintQuickExternal(page);
const score = report.detectionScore ?? report.score;
console.log(`external quick score: ${score}% (min ${MIN_SCORE}%)`);

await browser.close();

if (score < MIN_SCORE) {
  console.error('fingerprint external gate failed');
  process.exit(1);
}

console.log('test-fingerprint-external: passed');
