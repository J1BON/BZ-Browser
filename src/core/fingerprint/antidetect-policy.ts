import type { FingerprintConfig } from '../../types/profile.js';

/**
 * Antidetect defaults applied to every new profile.
 * Goal: unique per-profile identity, no cross-profile linking, captcha-resistant consistency.
 */
export const ANTIDETECT_DEFAULTS: Partial<FingerprintConfig> = {
  canvas: '2',
  webGlImage: '2',
  webGlMeta: '2',
  webGPU: '2',
  audioContext: '2',
  clientRects: '2',
  speechVoices: '2',
  mediaDevices: '2',
  webRTC: '3',
  fontEnable: '2',
  mac: '2',
  deviceName: '2',
  doNotTrack: '3',
  sslFingerprint: '2',
  portScanProtection: '1',
  hardwareAccelerate: '1',
};

export const DEFAULT_MIN_FP_SCORE = 85;

/** Android Chrome is engine-consistent on Chromium; iOS Safari UA on Chromium triggers bot scores. */
export function isEngineConsistent(fp: FingerprintConfig): boolean {
  return fp.device !== 'iOS';
}

export function antidetectWarnings(fp: FingerprintConfig, hasProxy: boolean): string[] {
  const warnings: string[] = [];
  if (!hasProxy) warnings.push('No proxy — sites see your real IP (high captcha/ban risk)');
  if (fp.device === 'iOS') warnings.push('iOS profile on Chromium engine — use Android for best antidetect');
  if (fp.webRTC !== '3') warnings.push('WebRTC not fully blocked — IP may leak');
  if (fp.sslFingerprint === '1') warnings.push('TLS spoof disabled — identical JA3 across profiles');
  return warnings;
}
