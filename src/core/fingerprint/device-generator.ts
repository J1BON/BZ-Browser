import { createHash } from 'crypto';
import { pickTlsProfile } from './tls-profiles.js';
import { pickChromeMajor, buildChromeVersion, DEFAULT_CHROME_MAJOR, CHROME_MAJORS } from './browser-versions.js';
import { FingerprintGenerator } from 'fingerprint-generator';
import { v4 as uuidv4 } from 'uuid';
import { seedInt, seedRandom } from './seed.js';
import type { FingerprintConfig, GeoIpResult } from '../../types/profile.js';

export type DeviceType = FingerprintConfig['device'];
export type FormFactor = FingerprintConfig['formFactor'];

export interface DeviceGenerateOptions {
  formFactor?: FormFactor;
  device?: DeviceType;
}

const fpGenDesktop = new FingerprintGenerator({
  browsers: [{ name: 'chrome', minVersion: 120 }],
  devices: ['desktop'],
  operatingSystems: ['windows', 'macos', 'linux'],
  mockWebRTC: true,
});

const fpGenMobile = new FingerprintGenerator({
  browsers: [{ name: 'chrome', minVersion: 120 }, { name: 'safari', minVersion: 15 }],
  devices: ['mobile'],
  operatingSystems: ['ios', 'android'],
  mockWebRTC: true,
});

type DesktopOs = 'Windows' | 'MacOS' | 'Linux';

function pickDesktopOs(rng: () => number): DesktopOs {
  const r = rng();
  if (r < 0.65) return 'Windows';
  if (r < 0.85) return 'MacOS';
  return 'Linux';
}

function pickMobileOs(rng: () => number, preferred?: DeviceType): 'iOS' | 'Android' {
  if (preferred === 'iOS') return 'iOS';
  if (preferred === 'Android') return 'Android';
  // Android Chrome on Chromium = engine-consistent (best antidetect on desktop Chromium)
  return rng() < 0.75 ? 'Android' : 'iOS';
}

function osToGeneratorKey(device: DesktopOs): 'windows' | 'macos' | 'linux' {
  if (device === 'MacOS') return 'macos';
  if (device === 'Linux') return 'linux';
  return 'windows';
}

function osVersionLabel(device: DeviceType): string {
  if (device === 'MacOS') return 'macos_14';
  if (device === 'Linux') return 'linux';
  if (device === 'iOS') return 'ios_17';
  if (device === 'Android') return 'android_14';
  return 'windows_10';
}

function randomMac(seed: string): string {
  const rng = seedRandom(`${seed}:mac`);
  const hex = () => Math.floor(rng() * 256).toString(16).padStart(2, '0');
  return Array.from({ length: 6 }, hex).join('-');
}

function randomDeviceName(seed: string, mobile: boolean): string {
  const desktopPrefixes = ['DESKTOP', 'LAPTOP', 'PC', 'WORKSTATION', 'WIN'];
  const mobilePrefixes = ['iPhone', 'Pixel', 'Galaxy', 'Mobile'];
  const rng = seedRandom(`${seed}:device`);
  const prefixes = mobile ? mobilePrefixes : desktopPrefixes;
  const suffix = Math.floor(rng() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  return `${prefixes[Math.floor(rng() * prefixes.length)]}-${suffix}`;
}

function inferWebGpuVendor(vendor: string): string {
  const v = vendor.toLowerCase();
  if (v.includes('nvidia')) return 'nvidia';
  if (v.includes('amd') || v.includes('ati')) return 'amd';
  if (v.includes('intel')) return 'intel';
  if (v.includes('apple')) return 'apple';
  return 'generic';
}

function patchUserAgentVersion(ua: string, browserVersion: string, mobileOs: 'iOS' | 'Android' | DesktopOs): string {
  const major = browserVersion.split('.')[0] ?? DEFAULT_CHROME_MAJOR;
  if (mobileOs === 'iOS') {
    return ua.replace(/Version\/[\d.]+/, `Version/${major}.0`).replace(/Safari\/[\d.]+/, 'Safari/605.1.15');
  }
  return ua.replace(/Chrome\/[\d.]+/, `Chrome/${browserVersion}`).replace(/Chromium\/[\d.]+/, `Chromium/${browserVersion}`);
}

function resolveBrowserVersion(deviceSeed: string, extracted?: string): string {
  const extractedMajor = extracted?.split('.')[0];
  const major = extractedMajor && CHROME_MAJORS.includes(extractedMajor as typeof CHROME_MAJORS[number])
    ? extractedMajor
    : pickChromeMajor(deviceSeed);
  return buildChromeVersion(major, deviceSeed);
}

function shuffleFonts(fonts: string[], seed: string, count: number): string[] {
  const rng = seedRandom(`${seed}:fonts`);
  const copy = [...fonts];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function baseSpoofFields(deviceSeed: string, _mobile: boolean) {
  return {
    canvas: '2' as const,
    webGlImage: '2' as const,
    webGlMeta: '2' as const,
    webGPU: '2' as const,
    audioContext: '2' as const,
    clientRects: '2' as const,
    speechVoices: '2' as const,
    mediaDevices: '2' as const,
    webRTC: '2' as const,
    fontEnable: '2' as const,
    mac: '2' as const,
    macValue: randomMac(deviceSeed),
    deviceName: '2' as const,
    deviceNameValue: randomDeviceName(deviceSeed, _mobile),
    doNotTrack: '3' as const,
    sslFingerprint: '2' as const,
    portScanProtection: '1' as const,
    hardwareAccelerate: '1' as const,
  };
}

/** Stable hash of device identity — used to detect duplicate profiles */
export function computeDeviceSignature(fp: FingerprintConfig): string {
  const payload = [
    fp.formFactor,
    fp.device,
    fp.userAgent,
    fp.webGlMode ?? '',
    fp.webGlMark ?? '',
    fp.macValue ?? '',
    fp.deviceNameValue ?? '',
    fp.hardwareConcurrency ?? '',
    fp.deviceMemory ?? '',
    fp.windowWidth,
    fp.windowHeight,
    fp.screenWidth ?? '',
    fp.screenHeight ?? '',
    fp.touchPoints ?? '',
    fp.fontList?.join(',') ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function generateMobileDevice(geo: GeoIpResult | undefined, deviceSeed: string, preferred?: DeviceType): FingerprintConfig {
  const rng = seedRandom(deviceSeed);
  const mobileOs = pickMobileOs(rng, preferred);
  const locale = geo?.languages?.[0] ?? 'en-US';
  const genOs = mobileOs === 'iOS' ? 'ios' : 'android';

  const { fingerprint } = fpGenMobile.getFingerprint({
    browsers: mobileOs === 'iOS'
      ? [{ name: 'safari', minVersion: 15 }]
      : [{ name: 'chrome', minVersion: 120 }],
    operatingSystems: [genOs],
    devices: ['mobile'],
    locales: [locale],
    mockWebRTC: true,
  });

  const nav = fingerprint.navigator;
  const screen = fingerprint.screen;
  const video = fingerprint.videoCard;

  const screenW = screen.width;
  const screenH = screen.height;
  const windowW = screen.innerWidth || screenW;
  const windowH = screen.innerHeight || screenH;

  const browserMatch = nav.userAgent.match(/(?:Chrome|Version)\/([\d.]+)/);
  const browserVersion = resolveBrowserVersion(deviceSeed, browserMatch?.[1]);
  const major = browserVersion.split('.')[0] ?? DEFAULT_CHROME_MAJOR;
  const userAgent = patchUserAgentVersion(nav.userAgent, browserVersion, mobileOs);

  return {
    userAgent,
    browserVersion,
    kernel: mobileOs === 'iOS' ? `Safari ${major}` : `Chrome ${major}`,
    device: mobileOs,
    formFactor: 'mobile',
    touchPoints: mobileOs === 'iOS' ? 5 : seedInt(`${deviceSeed}:touch`, 5, 10),
    osVersion: osVersionLabel(mobileOs),
    tlsProfileId: pickTlsProfile(mobileOs, browserVersion).id,
    windowWidth: windowW,
    windowHeight: windowH,
    screenWidth: screenW,
    screenHeight: screenH,
    screenLang: locale,
    systemLang: locale,
    timeZone: geo?.timezone ?? 'America/New_York',
    latitude: geo?.latitude,
    longitude: geo?.longitude,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory ?? [4, 6, 8][seedInt(`${deviceSeed}:dm`, 0, 2)],
    devicePixelRatio: screen.devicePixelRatio ?? (mobileOs === 'iOS' ? 3 : 2.625),
    webGlMark: video.vendor,
    webGlMode: video.renderer,
    webGPUVendor: inferWebGpuVendor(video.vendor),
    webGPUArchitecture: inferWebGpuVendor(video.vendor) === 'apple' ? 'apple-gpu' : 'generic',
    fontList: fingerprint.fonts.slice(0, 8),
    ...baseSpoofFields(deviceSeed, true),
  };
}

function generateDesktopDevice(geo: GeoIpResult | undefined, deviceSeed: string, preferred?: DeviceType): FingerprintConfig {
  const rng = seedRandom(deviceSeed);
  const device: DesktopOs = preferred === 'MacOS' || preferred === 'Linux' || preferred === 'Windows'
    ? preferred
    : pickDesktopOs(rng);
  const locale = geo?.languages?.[0] ?? 'en-US';

  const { fingerprint } = fpGenDesktop.getFingerprint({
    browsers: [{ name: 'chrome', minVersion: 120 }],
    operatingSystems: [osToGeneratorKey(device)],
    devices: ['desktop'],
    locales: [locale],
    mockWebRTC: true,
  });

  const nav = fingerprint.navigator;
  const screen = fingerprint.screen;
  const video = fingerprint.videoCard;

  const screenW = screen.width;
  const screenH = screen.height;
  const windowW = Math.min(screen.innerWidth || screenW - 80, screenW);
  const windowH = Math.min(screen.innerHeight || screenH - 60, screenH);

  const chromeMatch = nav.userAgent.match(/Chrome\/([\d.]+)/);
  const browserVersion = resolveBrowserVersion(deviceSeed, chromeMatch?.[1]);
  const major = browserVersion.split('.')[0] ?? DEFAULT_CHROME_MAJOR;
  const userAgent = patchUserAgentVersion(nav.userAgent, browserVersion, device);

  const baseFonts = fingerprint.fonts.length > 0
    ? fingerprint.fonts
    : ['Arial', 'Calibri', 'Consolas', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana'];
  const fontCount = seedInt(`${deviceSeed}:fc`, 14, Math.min(28, baseFonts.length));
  const fontList = shuffleFonts(baseFonts, deviceSeed, fontCount);

  return {
    userAgent,
    browserVersion,
    kernel: `Chrome ${major}`,
    device,
    formFactor: 'desktop',
    touchPoints: 0,
    osVersion: osVersionLabel(device),
    tlsProfileId: pickTlsProfile(device, browserVersion).id,
    windowWidth: windowW,
    windowHeight: windowH,
    screenWidth: screenW,
    screenHeight: screenH,
    screenLang: locale,
    systemLang: locale,
    timeZone: geo?.timezone ?? 'America/New_York',
    latitude: geo?.latitude,
    longitude: geo?.longitude,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory ?? [4, 8, 16][seedInt(`${deviceSeed}:dm`, 0, 2)],
    devicePixelRatio: screen.devicePixelRatio,
    webGlMark: video.vendor,
    webGlMode: video.renderer,
    webGPUVendor: inferWebGpuVendor(video.vendor),
    webGPUArchitecture: inferWebGpuVendor(video.vendor) === 'nvidia' ? 'ampere' : 'generic',
    fontList,
    ...baseSpoofFields(deviceSeed, false),
  };
}

/**
 * Generate a fully unique, internally-consistent device fingerprint.
 * Each call produces a distinct device (new seed = new device).
 */
export function generateUniqueDevice(
  geo?: GeoIpResult,
  seed?: string,
  options?: DeviceGenerateOptions,
): FingerprintConfig {
  const deviceSeed = seed ?? uuidv4();
  const formFactor = options?.formFactor ?? (options?.device === 'iOS' || options?.device === 'Android' ? 'mobile' : 'desktop');

  if (formFactor === 'mobile') {
    return generateMobileDevice(geo, deviceSeed, options?.device);
  }
  return generateDesktopDevice(geo, deviceSeed, options?.device);
}

export function regenerateDeviceFingerprint(
  existing: FingerprintConfig,
  geo?: GeoIpResult,
): { fingerprint: FingerprintConfig; fingerprintId: string; deviceSignature: string } {
  const fingerprintId = uuidv4();
  const fingerprint = generateUniqueDevice(geo, fingerprintId, {
    formFactor: existing.formFactor,
    device: existing.device,
  });
  return {
    fingerprint,
    fingerprintId,
    deviceSignature: computeDeviceSignature(fingerprint),
  };
}
