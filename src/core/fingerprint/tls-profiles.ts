import { CHROME_MAJORS, DEFAULT_CHROME_MAJOR } from './browser-versions.js';

/** Per-profile TLS/JA3 profiles — applied via patched Chromium launch args */
export interface TlsProfile {
  id: string;
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios';
  chromeMajor: string;
  ja3Hint: string;
  /** Reference JA3 for documentation — real TLS fingerprint comes from patched binary + --fingerprint-seed */
  args: string[];
}

const JA3_WIN = '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0';
const JA3_MAC = '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,65281-0-23-35-13-5-18-16-11-51-45-43-27,29-23-24,0';
const JA3_LINUX = '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0';
const JA3_IOS = '771,4865-4866-4867-49196-49195-52393-49200-49199-52392-49162-49161-49172-49171,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0';

function chromeProfile(
  os: TlsProfile['os'],
  major: string,
  ja3Hint: string,
  extraArgs: string[] = [],
): TlsProfile {
  const suffix = os === 'windows' ? 'win' : os === 'macos' ? 'mac' : os === 'linux' ? 'linux' : os;
  const label = os === 'windows' ? 'Windows'
    : os === 'macos' ? 'macOS'
    : os === 'linux' ? 'Linux'
    : os === 'android' ? 'Android'
    : 'iOS';
  return {
    id: `chrome${major}-${suffix}`,
    name: `Chrome ${major} ${label}`,
    os,
    chromeMajor: major,
    ja3Hint,
    args: ['--ssl-version-min=tls1.2', ...extraArgs],
  };
}

function buildChromeProfiles(): TlsProfile[] {
  const profiles: TlsProfile[] = [];
  for (const major of CHROME_MAJORS) {
    profiles.push(chromeProfile('windows', major, JA3_WIN, ['--disable-features=Tls13EarlyData']));
    profiles.push(chromeProfile('macos', major, JA3_MAC));
    profiles.push(chromeProfile('linux', major, JA3_LINUX));
    profiles.push(chromeProfile('android', major, JA3_LINUX));
  }
  profiles.push({
    id: 'safari17-ios',
    name: 'Safari 17 iOS',
    os: 'ios',
    chromeMajor: '17',
    ja3Hint: JA3_IOS,
    args: ['--ssl-version-min=tls1.2'],
  });
  return profiles;
}

export const TLS_PROFILES: TlsProfile[] = buildChromeProfiles();

export function pickTlsProfile(device: string, browserVersion: string): TlsProfile {
  const major = browserVersion.split('.')[0] ?? DEFAULT_CHROME_MAJOR;
  if (device === 'iOS') return TLS_PROFILES.find((p) => p.id === 'safari17-ios') ?? TLS_PROFILES[0];
  const osKey = device === 'Android' ? 'android'
    : device === 'MacOS' ? 'macos'
    : device === 'Linux' ? 'linux'
    : 'windows';
  const exact = TLS_PROFILES.find((p) => p.os === osKey && p.chromeMajor === major);
  if (exact) return exact;
  const fallback = TLS_PROFILES.find((p) => p.os === osKey && p.chromeMajor === DEFAULT_CHROME_MAJOR);
  return fallback ?? TLS_PROFILES[0];
}

export function getTlsProfile(id: string): TlsProfile | undefined {
  return TLS_PROFILES.find((p) => p.id === id);
}

export function buildTlsLaunchArgs(
  profileId: string | undefined,
  fingerprintId: string,
  device: string,
  browserVersion: string,
): string[] {
  const tls = profileId ? getTlsProfile(profileId) : pickTlsProfile(device, browserVersion);
  if (!tls) {
    return [`--fingerprint-seed=${fingerprintId.replace(/-/g, '').slice(0, 16)}`];
  }
  const major = browserVersion.split('.')[0] ?? tls.chromeMajor;
  const seedHex = fingerprintId.replace(/-/g, '').slice(0, 16);
  let fpInt = 2166136261;
  const mix = `${seedHex}:${tls.id}`;
  for (let i = 0; i < mix.length; i++) {
    fpInt ^= mix.charCodeAt(i);
    fpInt = Math.imul(fpInt, 16777619);
  }
  const fingerprintInt = (fpInt >>> 0) % 2_147_483_646 + 1;
  return [
    ...tls.args,
    `--fingerprint-seed=${seedHex}`,
    `--fingerprint=${fingerprintInt}`,
    `--user-agent-product=Chrome/${major}`,
  ];
}
