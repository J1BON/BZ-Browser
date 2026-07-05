import { v4 as uuidv4 } from 'uuid';
import type { BrowserProfile, FingerprintConfig, GeoIpResult } from '../../types/profile.js';
import {
  generateUniqueDevice,
  computeDeviceSignature,
  regenerateDeviceFingerprint,
  type DeviceGenerateOptions,
} from './device-generator.js';
import { DEFAULT_MIN_FP_SCORE } from './antidetect-policy.js';

export {
  computeDeviceSignature,
  generateUniqueDevice,
  regenerateDeviceFingerprint,
  type DeviceGenerateOptions,
} from './device-generator.js';

export { antidetectWarnings, isEngineConsistent, DEFAULT_MIN_FP_SCORE } from './antidetect-policy.js';

export function generateFingerprint(
  geo?: GeoIpResult,
  seed?: string,
  options?: DeviceGenerateOptions,
): FingerprintConfig {
  return generateUniqueDevice(geo, seed, options);
}

export function createProfile(
  name: string,
  geo?: GeoIpResult,
  options?: DeviceGenerateOptions,
): BrowserProfile {
  const fingerprintId = uuidv4();
  const fingerprint = generateUniqueDevice(geo, fingerprintId, options);
  const now = Date.now();

  return {
    id: uuidv4(),
    name,
    fingerprintId,
    fingerprint,
    deviceSignature: computeDeviceSignature(fingerprint),
    proxy: {
      category: '1',
      type: 'CustomProxy',
      host: '',
      port: '',
      rotationMode: 'off',
    },
    tags: [],
    openUrls: [],
    extensions: [],
    createTime: now,
    syncVersion: 1,
    isDefault: false,
    warmupOnLaunch: false,
    headless: false,
    minFpScore: DEFAULT_MIN_FP_SCORE,
    proxyPoolIds: [],
  };
}

export function createDefaultProfile(): BrowserProfile {
  const profile = createProfile('Default Profile');
  profile.isDefault = true;
  profile.remark = 'Pre-configured setup for quick access and seamless browsing.';
  return profile;
}

export function alignFingerprintWithGeo(
  fingerprint: FingerprintConfig,
  geo: GeoIpResult,
): FingerprintConfig {
  const lang = geo.languages[0] ?? fingerprint.screenLang;
  return {
    ...fingerprint,
    timeZone: geo.timezone,
    screenLang: lang,
    systemLang: lang,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
}

export function applyNewDeviceToProfile(
  profile: BrowserProfile,
  geo?: GeoIpResult,
): BrowserProfile {
  const { fingerprint, fingerprintId, deviceSignature } = regenerateDeviceFingerprint(
    profile.fingerprint,
    geo,
  );
  return {
    ...profile,
    fingerprintId,
    fingerprint,
    deviceSignature,
    syncVersion: profile.syncVersion + 1,
  };
}
