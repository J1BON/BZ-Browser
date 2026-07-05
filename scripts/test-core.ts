import assert from 'node:assert/strict';
import { buildTlsLaunchArgs, getTlsProfile } from '../src/core/fingerprint/tls-profiles.js';
import { buildNetworkHeaders } from '../src/core/fingerprint/injection.js';
import { buildCanonicalFingerprint } from '../src/core/fingerprint/canonical-fingerprint.js';
import { encryptBuffer, decryptBuffer, hashPassphrase, verifyPassphrase } from '../src/core/sync/encryption.js';
import type { FingerprintConfig } from '../src/types/profile.js';

function testTlsFingerprintIsInteger(): void {
  const args = buildTlsLaunchArgs('chrome136-win', 'abc-def-123', 'Windows', '136.0.7000.42');
  const fpArg = args.find((a) => a.startsWith('--fingerprint='));
  assert.ok(fpArg, 'missing --fingerprint arg');
  const val = fpArg.split('=')[1];
  assert.match(val, /^\d+$/, `--fingerprint must be integer, got ${val}`);
  assert.ok(!val.includes(','), 'JA3 string must not be passed to --fingerprint');
}

function testCanonicalFingerprintHeaders(): void {
  const fp: FingerprintConfig = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7000.42 Safari/537.36',
    browserVersion: '136.0.7000.42',
    kernel: 'Chrome 136',
    device: 'Windows',
    formFactor: 'desktop',
    touchPoints: 0,
    osVersion: 'windows_10',
    tlsProfileId: 'chrome136-win',
    windowWidth: 1920,
    windowHeight: 1080,
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
  const seed = 'profile-seed-1';
  const cf = buildCanonicalFingerprint(fp, seed);
  const headers = buildNetworkHeaders(fp, seed);
  assert.ok(headers['Accept-Language']?.includes('en'));
  assert.ok(!headers['Sec-CH-UA'], 'UA-CH must come from CDP, not extra headers');
  assert.ok(cf.uaFullVersion.includes('136'));
}

function testEncryptionRoundTrip(): void {
  const plain = Buffer.from('cloud-antidetect-secret-payload');
  const enc = encryptBuffer(plain, 'test-passphrase-123');
  const dec = decryptBuffer(enc, 'test-passphrase-123');
  assert.equal(dec.toString(), plain.toString());
}

function testScryptPassphrase(): void {
  const hash = hashPassphrase('secret');
  assert.ok(hash.startsWith('v2:'));
  assert.ok(verifyPassphrase(hash, 'secret'));
  assert.ok(!verifyPassphrase(hash, 'wrong'));
}

function testTlsProfileAlignedToMajor(): void {
  const p = getTlsProfile('chrome136-win');
  assert.ok(p);
  assert.equal(p!.chromeMajor, '136');
}

testTlsFingerprintIsInteger();
testCanonicalFingerprintHeaders();
testEncryptionRoundTrip();
testScryptPassphrase();
testTlsProfileAlignedToMajor();
console.log('test-core: all passed');
