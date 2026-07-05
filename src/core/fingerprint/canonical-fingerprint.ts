import type { FingerprintConfig } from '../../types/profile.js';
import { buildDeviceIdentity, buildAcceptLanguage, buildLanguageList } from './device-identity.js';
import { seedInt } from './seed.js';
import { pickWebGlProfile } from './webgl-profiles.js';

/** Single source of truth for JS injection, CDP UA override, and network identity. */
export interface CanonicalFingerprint {
  seed: string;
  ua: string;
  langs: string[];
  acceptLanguage: string;
  tz: string;
  lat: number;
  lon: number;
  w: number;
  h: number;
  innerW: number;
  innerH: number;
  dpr: number;
  platform: string;
  hwConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  isMobile: boolean;
  doNotTrack: string | null;
  uaBrands: { brand: string; version: string }[];
  uaPlatform: string;
  uaMobile: boolean;
  uaFullVersion: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  fullVersionList: { brand: string; version: string }[];
  webglVendor: string;
  webglRenderer: string;
  webglParams: Record<number, number | string | boolean>;
  webgpuVendor: string;
  webgpuArchitecture: string;
  canvasNoise: boolean;
  audioNoise: boolean;
  clientRectsNoise: boolean;
  fontSpoof: boolean;
  fonts: string[];
  spoofMediaDevices: boolean;
  spoofSpeechVoices: boolean;
  spoofWebGPU: boolean;
  webGlImageNoise: boolean;
  webGlMetaSpoof: boolean;
  portScanProtect: boolean;
  mediaDevicesList: { deviceId: string; kind: string; label: string; groupId: string }[];
  speechVoicesList: { name: string; lang: string; default: boolean; localService: boolean; voiceURI: string }[];
  availHeightOffset: number;
  colorDepth: number;
  connectionType: string;
  connectionDownlink: number;
  connectionRtt: number;
  batteryLevel: number;
  batteryCharging: boolean;
  macValue: string;
  deviceNameValue: string;
  proxyIp: string;
  audioSampleRate: number;
  webRtcProtect: boolean;
  webRtcBlock: boolean;
  notificationPermission: 'default' | 'denied' | 'granted';
  availLeft: number;
  availTop: number;
  screenOrientation: string;
}

function resolveHwConcurrency(fp: FingerprintConfig, seed: string, isMobile: boolean): number {
  if (fp.hardwareConcurrency != null) {
    return isMobile
      ? Math.min(8, Math.max(4, fp.hardwareConcurrency))
      : Math.min(16, Math.max(4, fp.hardwareConcurrency));
  }
  return isMobile ? seedInt(`${seed}:hw`, 4, 8) : seedInt(`${seed}:hw`, 4, 16);
}

function resolveDeviceMemory(fp: FingerprintConfig, seed: string, isMobile: boolean): number {
  const mobileOpts = [2, 4, 6, 8];
  const desktopOpts = [4, 8, 16];
  if (fp.deviceMemory != null) {
    return isMobile
      ? Math.min(8, Math.max(2, fp.deviceMemory))
      : Math.min(16, Math.max(4, fp.deviceMemory));
  }
  return isMobile
    ? mobileOpts[seedInt(`${seed}:mem`, 0, mobileOpts.length - 1)]
    : desktopOpts[seedInt(`${seed}:mem`, 0, desktopOpts.length - 1)];
}

function resolvePlatform(fp: FingerprintConfig): string {
  if (fp.device === 'iOS') return 'iPhone';
  if (fp.device === 'Android') return 'Linux armv81';
  if (fp.device === 'MacOS') return 'MacIntel';
  if (fp.device === 'Linux') return 'Linux x86_64';
  return 'Win32';
}

function resolveUaPlatform(fp: FingerprintConfig): string {
  if (fp.device === 'iOS') return 'iOS';
  if (fp.device === 'Android') return 'Android';
  if (fp.device === 'MacOS') return 'macOS';
  if (fp.device === 'Linux') return 'Linux';
  return 'Windows';
}

function buildUaBrands(fp: FingerprintConfig): { brand: string; version: string }[] {
  const major = fp.browserVersion.split('.')[0] ?? '136';
  if (fp.device === 'iOS') {
    return [{ brand: 'Safari', version: major }, { brand: 'Not_A Brand', version: '99' }];
  }
  return [
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
    { brand: 'Not_A Brand', version: '24' },
  ];
}

export function buildCanonicalFingerprint(
  fp: FingerprintConfig,
  seed: string,
  proxyIp = '',
): CanonicalFingerprint {
  const identity = buildDeviceIdentity(fp, seed);
  const isMobile = fp.formFactor === 'mobile';
  const screenW = fp.screenWidth ?? fp.windowWidth;
  const screenH = fp.screenHeight ?? fp.windowHeight;
  const webglVendor = fp.webGlMark ?? 'Google Inc. (NVIDIA)';
  const webglRenderer = fp.webGlMode ?? 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  const webglProfile = pickWebGlProfile(webglVendor, webglRenderer);

  return {
    seed,
    ua: fp.userAgent,
    langs: buildLanguageList(fp),
    acceptLanguage: buildAcceptLanguage(fp),
    tz: fp.timeZone,
    lat: fp.latitude ?? 0,
    lon: fp.longitude ?? 0,
    w: screenW,
    h: screenH,
    innerW: fp.windowWidth,
    innerH: fp.windowHeight,
    dpr: fp.devicePixelRatio ?? (isMobile ? 3 : 1),
    platform: resolvePlatform(fp),
    hwConcurrency: resolveHwConcurrency(fp, seed, isMobile),
    deviceMemory: resolveDeviceMemory(fp, seed, isMobile),
    maxTouchPoints: fp.touchPoints ?? (isMobile ? 5 : 0),
    isMobile,
    doNotTrack: fp.doNotTrack === '1' ? '1' : null,
    uaBrands: buildUaBrands(fp),
    uaPlatform: resolveUaPlatform(fp),
    uaMobile: isMobile,
    uaFullVersion: identity.uaFullVersion,
    platformVersion: identity.platformVersion,
    architecture: identity.architecture,
    bitness: identity.bitness,
    model: identity.model,
    fullVersionList: identity.fullVersionList,
    webglVendor,
    webglRenderer,
    webglParams: webglProfile.params,
    webgpuVendor: fp.webGPUVendor ?? webglProfile.webgpuVendor,
    webgpuArchitecture: fp.webGPUArchitecture ?? webglProfile.webgpuArchitecture,
    canvasNoise: fp.canvas === '2',
    audioNoise: fp.audioContext === '2',
    clientRectsNoise: fp.clientRects === '2',
    fontSpoof: fp.fontEnable === '2',
    fonts: fp.fontList ?? ['Arial', 'Calibri', 'Segoe UI', 'Times New Roman', 'Verdana'],
    spoofMediaDevices: fp.mediaDevices === '2',
    spoofSpeechVoices: fp.speechVoices === '2',
    spoofWebGPU: fp.webGPU === '2',
    webGlImageNoise: fp.webGlImage === '2',
    webGlMetaSpoof: fp.webGlMeta !== '1',
    portScanProtect: fp.portScanProtection !== '2',
    mediaDevicesList: identity.mediaDevices,
    speechVoicesList: identity.speechVoices,
    availHeightOffset: seedInt(`${seed}:avail`, 32, 48),
    colorDepth: seedInt(`${seed}:cd`, 0, 1) === 0 ? 24 : 32,
    connectionType: ['4g', '4g', '3g'][seedInt(`${seed}:net`, 0, 2)],
    connectionDownlink: 5 + seedInt(`${seed}:dl`, 0, 15),
    connectionRtt: 40 + seedInt(`${seed}:rtt`, 0, 80),
    batteryLevel: 0.55 + seedInt(`${seed}:bat`, 0, 40) / 100,
    batteryCharging: seedInt(`${seed}:chg`, 0, 1) === 1,
    macValue: fp.macValue ?? '00-00-00-00-00-00',
    deviceNameValue: fp.deviceNameValue ?? 'DESKTOP-PC',
    proxyIp,
    audioSampleRate: seedInt(`${seed}:sr`, 0, 1) === 0 ? 44100 : 48000,
    webRtcProtect: fp.webRTC === '2' || fp.webRTC === '3',
    webRtcBlock: fp.webRTC === '3',
    notificationPermission: 'default',
    availLeft: 0,
    availTop: 0,
    screenOrientation: isMobile ? 'portrait-primary' : 'landscape-primary',
  };
}

export function canonicalToCdpUserAgentMetadata(cf: CanonicalFingerprint) {
  return {
    brands: cf.uaBrands.map((b) => ({ brand: b.brand, version: b.version })),
    fullVersionList: cf.fullVersionList.map((b) => ({ brand: b.brand, version: b.version })),
    fullVersion: cf.uaFullVersion,
    platform: cf.uaPlatform,
    platformVersion: cf.platformVersion,
    architecture: cf.architecture,
    model: cf.model,
    mobile: cf.uaMobile,
    bitness: cf.bitness,
    wow64: false,
  };
}

/** iOS Safari UA on Blink is always detectable — block unless explicitly overridden. */
export function isIosOnChromium(fp: FingerprintConfig): boolean {
  return fp.device === 'iOS';
}
