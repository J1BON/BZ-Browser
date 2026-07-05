/**
 * Static regression gate — ensures critical injection hooks stay wired.
 * Run in CI alongside test:core; does not require a live browser.
 */
import assert from 'node:assert/strict';
import { buildFingerprintScript } from '../src/core/fingerprint/injection.js';
import type { FingerprintConfig } from '../src/types/profile.js';

const BASE_FP: FingerprintConfig = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Safari/537.36',
  browserVersion: '131.0.6778.204',
  kernel: 'Chrome 131',
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

function mustInclude(script: string, needle: string, label: string): void {
  assert.ok(script.includes(needle), `injection missing ${label}: ${needle}`);
}

function mustNotInclude(script: string, needle: string, label: string): void {
  assert.ok(!script.includes(needle), `injection should not contain ${label}: ${needle}`);
}

const script = buildFingerprintScript(BASE_FP, 'contract-seed', '203.0.113.10');

mustInclude(script, '_nativeCtxGetImageData', 'canvas native read');
mustInclude(script, 'readNoisedImageData', 'unified canvas noise');
mustInclude(script, '_noisedArrays', 'audio WeakSet guard');
mustInclude(script, 'scrubStatsReport', 'WebRTC getStats scrub');
mustInclude(script, 'candidate-pair', 'WebRTC candidate-pair rewrite');
mustInclude(script, 'Object.setPrototypeOf(uadObj', 'NavigatorUAData prototype');
mustInclude(script, 'patchUserAgentData', 'shared userAgentData hook');
mustInclude(script, 'fmt.rangeMin', 'WebGL shader precision mutate');
mustInclude(script, 'Object.defineProperty(metrics', 'TextMetrics identity preserve');
mustInclude(script, 'WrappedPC.generateCertificate', 'RTCPeerConnection statics');
mustInclude(script, 'getSupportedExtensions', 'WebGL extensions hook');

mustNotInclude(script, 'return { rangeMin:', 'plain WebGLShaderPrecisionFormat object');

console.log('test-injection-contract: all passed');
