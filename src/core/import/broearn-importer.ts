import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import { BrowserProfileSchema, type BrowserProfile } from '../../types/profile.js';
import { computeDeviceSignature } from '../fingerprint/device-generator.js';

interface BroearnProfile {
  id?: string;
  name?: string;
  remark?: string;
  fingerprint_id?: string;
  userAgent?: string;
  browserVersion?: string;
  kernel?: string;
  device?: string;
  osVersion?: string;
  windowWidth?: number;
  windowHeight?: number;
  screenLang?: string;
  systemLang?: string;
  timeZone?: string;
  latitude?: number;
  longitude?: number;
  canvas?: string;
  webGlImage?: string;
  webGlMeta?: string;
  webGlMark?: string;
  webGlMode?: string;
  webGPU?: string;
  webGPUVendor?: string;
  webGPUArchitecture?: string;
  audioContext?: string;
  clientRects?: string;
  speechVoices?: string;
  mediaDevices?: string;
  webRTC?: string;
  fontEnable?: string;
  fontList?: string[];
  mac?: string;
  macValue?: string;
  deviceName?: string;
  deviceNameValue?: string;
  doNotTrack?: string;
  sslFingerprint?: string;
  portScanProtection?: string;
  hardwareAccelerate?: string;
  proxyHost?: string;
  proxyPort?: string;
  proxyAccount?: string;
  proxyPwd?: string;
  proxyCategory?: string;
  proxyType?: string;
  proxyCountry?: string;
  proxyCity?: string;
  proxyTimezone?: string;
  proxyIP?: string;
  openUrls?: string[];
  createTime?: number;
  lastOpened?: number;
  isDefault?: boolean;
  no_color?: number;
}

function spoofMode(val: unknown, fallback: '1' | '2' | '3' = '2'): '1' | '2' | '3' {
  const s = String(val ?? fallback);
  return (s === '1' || s === '2' || s === '3') ? s : fallback;
}

export function broearnToProfile(raw: BroearnProfile, fallbackName?: string): BrowserProfile {
  const legacyId = String(raw.id ?? raw.fingerprint_id ?? uuidv4());
  const fingerprintId = isUuid(String(raw.fingerprint_id ?? ''))
    ? String(raw.fingerprint_id)
    : uuidv4();

  const fingerprint = {
    userAgent: raw.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Safari/537.36',
    browserVersion: raw.browserVersion ?? '127.0.6533.103',
    kernel: raw.kernel,
      device: (['Windows', 'MacOS', 'Linux', 'iOS', 'Android'] as const).includes(raw.device as 'Windows')
        ? (raw.device as 'Windows' | 'MacOS' | 'Linux' | 'iOS' | 'Android')
        : 'Windows',
      formFactor: (raw.device === 'iOS' || raw.device === 'Android' ? 'mobile' : 'desktop') as 'desktop' | 'mobile',
    osVersion: raw.osVersion ?? 'windows_10',
    windowWidth: raw.windowWidth ?? 1280,
    windowHeight: raw.windowHeight ?? 720,
    screenLang: raw.screenLang ?? 'en-US',
    systemLang: raw.systemLang ?? 'en-US',
    timeZone: raw.timeZone ?? raw.proxyTimezone ?? 'America/New_York',
    latitude: raw.latitude,
    longitude: raw.longitude,
    canvas: spoofMode(raw.canvas),
    webGlImage: spoofMode(raw.webGlImage),
    webGlMeta: spoofMode(raw.webGlMeta),
    webGlMark: raw.webGlMark,
    webGlMode: raw.webGlMode,
    webGPU: spoofMode(raw.webGPU),
    webGPUVendor: raw.webGPUVendor,
    webGPUArchitecture: raw.webGPUArchitecture,
    audioContext: spoofMode(raw.audioContext),
    clientRects: spoofMode(raw.clientRects),
    speechVoices: spoofMode(raw.speechVoices),
    mediaDevices: spoofMode(raw.mediaDevices),
    webRTC: spoofMode(raw.webRTC, '3'),
    fontEnable: spoofMode(raw.fontEnable),
    fontList: raw.fontList,
    mac: spoofMode(raw.mac),
    macValue: raw.macValue,
    deviceName: spoofMode(raw.deviceName),
    deviceNameValue: raw.deviceNameValue,
    doNotTrack: raw.doNotTrack ?? '2',
    sslFingerprint: spoofMode(raw.sslFingerprint),
    portScanProtection: spoofMode(raw.portScanProtection, '1'),
    hardwareAccelerate: spoofMode(raw.hardwareAccelerate, '1'),
  };

  return BrowserProfileSchema.parse({
    id: uuidv4(),
    name: raw.name ?? fallbackName ?? `Imported ${legacyId.slice(0, 8)}`,
    remark: raw.remark,
    fingerprintId,
    legacyId,
    deviceSignature: computeDeviceSignature(fingerprint),
    fingerprint,
    proxy: {
      category: raw.proxyCategory ?? '1',
      type: raw.proxyType ?? 'CustomProxy',
      host: raw.proxyHost ?? '',
      port: raw.proxyPort ?? '',
      account: raw.proxyAccount,
      password: raw.proxyPwd,
      country: raw.proxyCountry,
      city: raw.proxyCity,
      timezone: raw.proxyTimezone,
      ip: raw.proxyIP,
    },
    tags: ['imported-broearn'],
    color: raw.no_color ? `#${raw.no_color.toString(16).padStart(6, '0')}` : undefined,
    openUrls: raw.openUrls ?? [],
    extensions: [],
    createTime: raw.createTime ?? Date.now(),
    lastOpened: raw.lastOpened,
    syncVersion: 1,
    isDefault: raw.isDefault ?? false,
  });
}

async function scanProfileJsonDir(dir: string, seen: Set<string>, profiles: BrowserProfile[]): Promise<void> {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8')) as BroearnProfile;
      const legacyKey = String(raw.id ?? raw.fingerprint_id ?? file);
      if (seen.has(legacyKey)) continue;
      seen.add(legacyKey);
      profiles.push(broearnToProfile(raw, file.replace('.json', '')));
    }
  } catch {
    // directory missing or unreadable
  }
}

export async function importBroearnProfiles(broearnDataDir: string): Promise<BrowserProfile[]> {
  const profiles: BrowserProfile[] = [];
  const seen = new Set<string>();

  const profileDirs = new Set<string>();
  profileDirs.add(path.join(broearnDataDir, 'Default', 'Profile'));
  profileDirs.add(path.join(broearnDataDir, '8rdfGvBwAWxi5RNaQbEmENYy7nX84yjoXbVAipgR5tgm', 'Profile'));

  try {
    const entries = await fs.readdir(broearnDataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        profileDirs.add(path.join(broearnDataDir, entry.name, 'Profile'));
      }
    }
  } catch {
    // ignore
  }

  for (const dir of profileDirs) {
    await scanProfileJsonDir(dir, seen, profiles);
  }

  return profiles;
}
