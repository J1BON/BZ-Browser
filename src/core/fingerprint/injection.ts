import type { BrowserProfile, FingerprintConfig } from '../../types/profile.js';
import { seedInt } from './seed.js';
import { buildTlsLaunchArgs } from './tls-profiles.js';
import { buildDeviceIdentity, buildAcceptLanguage, buildLanguageList } from './device-identity.js';
import { buildInjectionRuntimeScript } from './injection-runtime.js';
import { DEFAULT_CHROME_MAJOR } from './browser-versions.js';
function resolvePlatform(fp: FingerprintConfig): string {
  if (fp.device === 'iOS') return 'iPhone';
  if (fp.device === 'Android') return 'Linux armv81';
  if (fp.device === 'MacOS') return 'MacIntel';
  if (fp.device === 'Linux') return 'Linux x86_64';
  return 'Win32';
}

function buildUaBrands(fp: FingerprintConfig): { brand: string; version: string }[] {
  const major = fp.browserVersion.split('.')[0] ?? DEFAULT_CHROME_MAJOR;
  if (fp.device === 'iOS') {
    return [
      { brand: 'Safari', version: major },
      { brand: 'Not_A Brand', version: '99' },
    ];
  }
  return [
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
    { brand: 'Not_A Brand', version: '24' },
  ];
}

function resolveUaPlatform(fp: FingerprintConfig): string {
  if (fp.device === 'iOS') return 'iOS';
  if (fp.device === 'Android') return 'Android';
  if (fp.device === 'MacOS') return 'macOS';
  if (fp.device === 'Linux') return 'Linux';
  return 'Windows';
}

export interface InjectionPayload {
  ua: string;
  langs: string[];
  tz: string;
  lat: number;
  lon: number;
  w: number;
  h: number;
  innerW: number;
  innerH: number;
  dpr: number;
  webglVendor: string;
  webglRenderer: string;
  webgpuVendor: string;
  webgpuArchitecture: string;
  canvasNoise: boolean;
  audioNoise: boolean;
  clientRectsNoise: boolean;
  fontSpoof: boolean;
  fonts: string[];
  blockWebRTC: boolean;
  spoofMediaDevices: boolean;
  spoofSpeechVoices: boolean;
  spoofWebGPU: boolean;
  seed: string;
  hwConcurrency: number;
  deviceMemory: number;
  platform: string;
  maxTouchPoints: number;
  isMobile: boolean;
  doNotTrack: string | null;
  portScanProtect: boolean;
  webGlImageNoise: boolean;
  webGlMetaSpoof: boolean;
  uaBrands: { brand: string; version: string }[];
  uaPlatform: string;
  uaMobile: boolean;
  webrtcRelay: boolean;
  macValue: string;
  deviceNameValue: string;
  proxyIp: string;
  uaFullVersion: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  fullVersionList: { brand: string; version: string }[];
  mediaDevicesList: { deviceId: string; kind: string; label: string; groupId: string }[];
  speechVoicesList: { name: string; lang: string; default: boolean; localService: boolean; voiceURI: string }[];
  availHeightOffset: number;
  colorDepth: number;
  connectionType: string;
  connectionDownlink: number;
  connectionRtt: number;
  batteryLevel: number;
  batteryCharging: boolean;
  webglMaxTexture: number;
}

export function buildInjectionPayload(fp: FingerprintConfig, seed: string): InjectionPayload {
  const platform = resolvePlatform(fp);
  const screenW = fp.screenWidth ?? fp.windowWidth;
  const screenH = fp.screenHeight ?? fp.windowHeight;
  const isMobile = fp.formFactor === 'mobile';
  const identity = buildDeviceIdentity(fp, seed);
  const langs = buildLanguageList(fp);

  return {
    ua: fp.userAgent,
    langs,
    tz: fp.timeZone,
    lat: fp.latitude ?? 0,
    lon: fp.longitude ?? 0,
    w: screenW,
    h: screenH,
    innerW: fp.windowWidth,
    innerH: fp.windowHeight,
    dpr: fp.devicePixelRatio ?? (isMobile ? 3 : 1),
    webglVendor: fp.webGlMark ?? 'Google Inc. (NVIDIA)',
    webglRenderer: fp.webGlMode ?? 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    webgpuVendor: fp.webGPUVendor ?? 'nvidia',
    webgpuArchitecture: fp.webGPUArchitecture ?? 'ampere',
    canvasNoise: fp.canvas === '2',
    audioNoise: fp.audioContext === '2',
    clientRectsNoise: fp.clientRects === '2',
    fontSpoof: fp.fontEnable === '2',
    fonts: fp.fontList ?? ['Arial', 'Calibri', 'Segoe UI', 'Times New Roman', 'Verdana'],
    blockWebRTC: false,
    webrtcRelay: fp.webRTC === '2',
    spoofMediaDevices: fp.mediaDevices === '2',
    spoofSpeechVoices: fp.speechVoices === '2',
    spoofWebGPU: fp.webGPU === '2',
    seed,
    hwConcurrency: fp.hardwareConcurrency ?? seedInt(seed + 'hw', 4, 16),
    deviceMemory: fp.deviceMemory ?? [4, 8, 16][seedInt(seed + 'mem', 0, 2)],
    platform,
    maxTouchPoints: fp.touchPoints ?? (isMobile ? 5 : 0),
    isMobile,
    doNotTrack: fp.doNotTrack === '1' ? '1' : null,
    portScanProtect: fp.portScanProtection !== '2',
    webGlImageNoise: fp.webGlImage === '2',
    webGlMetaSpoof: fp.webGlMeta !== '1',
    uaBrands: buildUaBrands(fp),
    uaPlatform: resolveUaPlatform(fp),
    uaMobile: isMobile,
    macValue: fp.macValue ?? '00-00-00-00-00-00',
    deviceNameValue: fp.deviceNameValue ?? 'DESKTOP-PC',
    proxyIp: '',
    uaFullVersion: identity.uaFullVersion,
    platformVersion: identity.platformVersion,
    architecture: identity.architecture,
    bitness: identity.bitness,
    model: identity.model,
    fullVersionList: identity.fullVersionList,
    mediaDevicesList: identity.mediaDevices,
    speechVoicesList: identity.speechVoices,
    availHeightOffset: seedInt(`${seed}:avail`, 32, 48),
    colorDepth: seedInt(`${seed}:cd`, 0, 1) === 0 ? 24 : 32,
    connectionType: ['4g', '4g', '3g'][seedInt(`${seed}:net`, 0, 2)],
    connectionDownlink: 5 + seedInt(`${seed}:dl`, 0, 15),
    connectionRtt: 40 + seedInt(`${seed}:rtt`, 0, 80),
    batteryLevel: 0.55 + seedInt(`${seed}:bat`, 0, 40) / 100,
    batteryCharging: seedInt(`${seed}:chg`, 0, 1) === 1,
    webglMaxTexture: [8192, 16384, 16384][seedInt(`${seed}:tex`, 0, 2)],
  };
}

export function buildInjectionPayloadWithProxy(fp: FingerprintConfig, seed: string, proxyIp?: string): InjectionPayload {
  const payload = buildInjectionPayload(fp, seed);
  if (proxyIp) payload.proxyIp = proxyIp;
  return payload;
}

export function buildFingerprintScript(
  fp: FingerprintConfig,
  fingerprintId = 'default',
  proxyIp?: string,
  options?: { useNativeKernel?: boolean },
): string {
  const FP = buildInjectionPayloadWithProxy(fp, fingerprintId, proxyIp);
  return buildInjectionRuntimeScript(JSON.stringify(FP), {
    useNativeKernel: options?.useNativeKernel ?? false,
  });
}

export function buildLaunchArgs(profile: BrowserProfile, fingerprintId?: string): string[] {
  const fp = profile.fingerprint;
  const isMobile = fp.formFactor === 'mobile';
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    `--window-size=${fp.windowWidth},${fp.windowHeight}`,
    `--lang=${fp.screenLang}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--exclude-switches=enable-automation',
    '--disable-component-update',
  ];

  args.push(...buildTlsLaunchArgs(
    fp.tlsProfileId,
    fingerprintId ?? profile.fingerprintId ?? 'default',
    fp.device,
    fp.browserVersion,
  ));

  if (fp.webRTC === '2') {
    args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  } else if (fp.webRTC === '3') {
    args.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
  }

  if (profile.headless) {
    args.push('--headless=new');
  }

  if (fp.hardwareAccelerate === '1') {
    args.push('--enable-gpu-rasterization');
  }

  if (fp.portScanProtection !== '2') {
    args.push('--disable-background-networking');
  }

  if (isMobile) {
    args.push('--enable-touch-events');
  }

  if (profile.proxy.host && profile.proxy.port) {
    const scheme = profile.proxy.type?.toLowerCase().includes('socks') ? 'socks5' : 'http';
    args.push(`--proxy-server=${scheme}://${profile.proxy.host}:${profile.proxy.port}`);
  }

  return args;
}

export function buildExtraHeaders(fp: FingerprintConfig, seed?: string): Record<string, string> {
  const major = fp.browserVersion.split('.')[0] ?? '136';
  const isMobile = fp.formFactor === 'mobile';
  const platformHeader = fp.device === 'iOS' ? '"iOS"'
    : fp.device === 'Android' ? '"Android"'
    : fp.device === 'MacOS' ? '"macOS"'
    : fp.device === 'Linux' ? '"Linux"'
    : '"Windows"';

  const brandHeader = fp.device === 'iOS'
    ? `"Safari";v="${major}", "Not_A Brand";v="99"`
    : `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`;

  const identity = buildDeviceIdentity(fp, seed ?? 'headers');
  const fullList = identity.fullVersionList
    .map((b) => `"${b.brand}";v="${b.version.split('.')[0]}"`)
    .join(', ');

  return {
    'Accept-Language': buildAcceptLanguage(fp),
    'Sec-CH-UA': brandHeader,
    'Sec-CH-UA-Mobile': isMobile ? '?1' : '?0',
    'Sec-CH-UA-Platform': platformHeader,
    'Sec-CH-UA-Full-Version-List': fullList,
    'Sec-CH-UA-Platform-Version': `"${identity.platformVersion}"`,
    'Sec-CH-UA-Arch': `"${identity.architecture}"`,
    'Sec-CH-UA-Bitness': `"${identity.bitness}"`,
  };
}
