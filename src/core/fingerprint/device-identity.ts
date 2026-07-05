import { seedInt, seedRandom } from './seed.js';
import type { FingerprintConfig } from '../../types/profile.js';

export interface MediaDeviceEntry {
  deviceId: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
  groupId: string;
}

export interface SpeechVoiceEntry {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
  voiceURI: string;
}

export interface DeviceIdentityBundle {
  vendor: string;
  uaFullVersion: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  fullVersionList: { brand: string; version: string }[];
  mediaDevices: MediaDeviceEntry[];
  speechVoices: SpeechVoiceEntry[];
}

function hexId(seed: string, label: string, len = 32): string {
  const rng = seedRandom(`${seed}:${label}`);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += Math.floor(rng() * 16).toString(16);
  }
  return out;
}

function pickPlatformVersion(device: FingerprintConfig['device'], seed: string): string {
  if (device === 'MacOS') return `${13 + seedInt(`${seed}:macv`, 0, 2)}.${seedInt(`${seed}:macm`, 0, 5)}.0`;
  if (device === 'Windows') return seedInt(`${seed}:win`, 0, 1) === 0 ? '15.0.0' : '10.0.0';
  if (device === 'Linux') return `${5 + seedInt(`${seed}:lnxv`, 0, 2)}.${seedInt(`${seed}:lnxm`, 0, 15)}.0`;
  if (device === 'Android') return `${12 + seedInt(`${seed}:andv`, 0, 2)}.0.0`;
  if (device === 'iOS') return `${16 + seedInt(`${seed}:iosv`, 0, 2)}.0.0`;
  return '10.0.0';
}

function buildFullVersionList(fp: FingerprintConfig): { brand: string; version: string }[] {
  const full = fp.browserVersion.includes('.') ? fp.browserVersion : `${fp.browserVersion.split('.')[0]}.0.0.0`;
  if (fp.device === 'iOS') {
    return [
      { brand: 'Safari', version: full },
      { brand: 'Not_A Brand', version: '99.0.0.0' },
    ];
  }
  return [
    { brand: 'Google Chrome', version: full },
    { brand: 'Chromium', version: full },
    { brand: 'Not_A Brand', version: '24.0.0.0' },
  ];
}

function windowsVoices(seed: string, lang: string): SpeechVoiceEntry[] {
  const rng = seedRandom(`${seed}:voices`);
  const names = rng() > 0.5
    ? ['Microsoft David Desktop - English (United States)', 'Microsoft Zira Desktop - English (United States)']
    : ['Microsoft Mark Desktop - English (United States)', 'Microsoft Eva Desktop - English (United States)'];
  return names.map((name, i) => ({
    name,
    lang,
    default: i === 0,
    localService: true,
    voiceURI: name.toLowerCase().replace(/\s+/g, '-'),
  }));
}

function macVoices(seed: string, lang: string): SpeechVoiceEntry[] {
  const names = ['Samantha', 'Alex', 'Victoria'];
  const idx = seedInt(`${seed}:voice`, 0, names.length - 1);
  return [
    { name: names[idx], lang, default: true, localService: true, voiceURI: `com.apple.voice.compact.en-US.${names[idx]}` },
    { name: 'Daniel', lang: 'en-GB', default: false, localService: true, voiceURI: 'com.apple.voice.compact.en-GB.Daniel' },
  ];
}

function androidVoices(lang: string): SpeechVoiceEntry[] {
  return [
    { name: 'Google US English', lang, default: true, localService: true, voiceURI: 'en-US-language' },
    { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: true, voiceURI: 'en-GB-language' },
  ];
}

function buildSpeechVoices(fp: FingerprintConfig, seed: string): SpeechVoiceEntry[] {
  const lang = fp.screenLang || 'en-US';
  if (fp.device === 'MacOS') return macVoices(seed, lang);
  if (fp.device === 'Android' || fp.device === 'iOS') return androidVoices(lang);
  if (fp.device === 'Linux') {
    return [{ name: 'English (America)', lang, default: true, localService: false, voiceURI: 'english-america' }];
  }
  return windowsVoices(seed, lang);
}

function buildMediaDevices(fp: FingerprintConfig, seed: string): MediaDeviceEntry[] {
  const audioIn = hexId(seed, 'audioin');
  const audioOut = hexId(seed, 'audioout');
  const videoIn = hexId(seed, 'videoin');
  const g1 = hexId(seed, 'grp1', 16);
  const g2 = hexId(seed, 'grp2', 16);
  const g3 = hexId(seed, 'grp3', 16);

  const micLabel = fp.device === 'MacOS'
    ? 'MacBook Pro Microphone'
    : fp.device === 'Windows'
      ? 'Microphone (Realtek High Definition Audio)'
      : fp.device === 'Android'
        ? 'Built-in Microphone'
        : 'Default Audio Device';

  const camLabel = fp.formFactor === 'mobile'
    ? fp.device === 'iOS' ? 'Front Camera' : 'camera2 1, facing front'
    : fp.device === 'MacOS' ? 'FaceTime HD Camera' : 'Integrated Webcam';

  return [
    { deviceId: `default:${audioIn}`, kind: 'audioinput', label: micLabel, groupId: g1 },
    { deviceId: audioIn, kind: 'audioinput', label: micLabel, groupId: g1 },
    { deviceId: `default:${audioOut}`, kind: 'audiooutput', label: 'Default Speaker', groupId: g2 },
    { deviceId: audioOut, kind: 'audiooutput', label: 'Default Speaker', groupId: g2 },
    { deviceId: videoIn, kind: 'videoinput', label: camLabel, groupId: g3 },
  ];
}

export function buildDeviceIdentity(fp: FingerprintConfig, seed: string): DeviceIdentityBundle {
  const major = fp.browserVersion.split('.')[0] ?? '131';
  const padded = fp.browserVersion.includes('.') ? fp.browserVersion : `${major}.0.0.0`;

  return {
    vendor: 'Google Inc.',
    uaFullVersion: padded,
    platformVersion: pickPlatformVersion(fp.device, seed),
    architecture: fp.formFactor === 'mobile' || fp.device === 'iOS' ? 'arm' : 'x86',
    bitness: '64',
    model: fp.formFactor === 'mobile'
      ? fp.device === 'iOS' ? 'iPhone' : 'Pixel 8'
      : '',
    fullVersionList: buildFullVersionList(fp),
    mediaDevices: buildMediaDevices(fp, seed),
    speechVoices: buildSpeechVoices(fp, seed),
  };
}

export function buildLanguageList(fp: FingerprintConfig): string[] {
  const primary = fp.screenLang || 'en-US';
  const base = primary.split('-')[0];
  const langs = [primary];
  if (base !== primary) langs.push(base);
  if (!langs.includes('en-US')) langs.push('en-US');
  if (!langs.includes('en') && base !== 'en') langs.push('en');
  return [...new Set(langs)];
}

export function buildAcceptLanguage(fp: FingerprintConfig): string {
  const langs = buildLanguageList(fp);
  return langs.map((l, i) => (i === 0 ? l : `${l};q=${Math.max(0.5, 0.9 - i * 0.1).toFixed(1)}`)).join(',');
}
