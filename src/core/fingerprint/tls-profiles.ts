/** Per-profile TLS/JA3 profiles — applied via patched Chromium launch args */
export interface TlsProfile {
  id: string;
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios';
  chromeMajor: string;
  ja3Hint: string;
  args: string[];
}

export const TLS_PROFILES: TlsProfile[] = [
  {
    id: 'chrome131-win',
    name: 'Chrome 131 Windows',
    os: 'windows',
    chromeMajor: '131',
    ja3Hint: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0',
    args: ['--ssl-version-min=tls1.2', '--disable-features=Tls13EarlyData'],
  },
  {
    id: 'chrome131-mac',
    name: 'Chrome 131 macOS',
    os: 'macos',
    chromeMajor: '131',
    ja3Hint: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,65281-0-23-35-13-5-18-16-11-51-45-43-27,29-23-24,0',
    args: ['--ssl-version-min=tls1.2'],
  },
  {
    id: 'chrome131-linux',
    name: 'Chrome 131 Linux',
    os: 'linux',
    chromeMajor: '131',
    ja3Hint: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0',
    args: ['--ssl-version-min=tls1.2'],
  },
  {
    id: 'chrome131-android',
    name: 'Chrome 131 Android',
    os: 'android',
    chromeMajor: '131',
    ja3Hint: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0',
    args: ['--ssl-version-min=tls1.2'],
  },
  {
    id: 'safari17-ios',
    name: 'Safari 17 iOS',
    os: 'ios',
    chromeMajor: '17',
    ja3Hint: '771,4865-4866-4867-49196-49195-52393-49200-49199-52392-49162-49161-49172-49171,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0',
    args: ['--ssl-version-min=tls1.2'],
  },
];

export function pickTlsProfile(device: string, browserVersion: string): TlsProfile {
  const major = browserVersion.split('.')[0] ?? '131';
  if (device === 'iOS') return TLS_PROFILES.find((p) => p.id === 'safari17-ios') ?? TLS_PROFILES[0];
  if (device === 'Android') return TLS_PROFILES.find((p) => p.id === 'chrome131-android') ?? TLS_PROFILES[0];
  if (device === 'MacOS') return TLS_PROFILES.find((p) => p.os === 'macos') ?? TLS_PROFILES[1];
  if (device === 'Linux') return TLS_PROFILES.find((p) => p.os === 'linux') ?? TLS_PROFILES[2];
  const win = TLS_PROFILES.find((p) => p.os === 'windows' && p.chromeMajor === major);
  return win ?? TLS_PROFILES[0];
}

export function getTlsProfile(id: string): TlsProfile | undefined {
  return TLS_PROFILES.find((p) => p.id === id);
}

export function buildTlsLaunchArgs(profileId: string | undefined, fingerprintId: string, device: string, browserVersion: string): string[] {
  const tls = profileId ? getTlsProfile(profileId) : pickTlsProfile(device, browserVersion);
  if (!tls) return [`--fingerprint-seed=${fingerprintId.slice(0, 8)}`];
  return [
    ...tls.args,
    `--fingerprint-seed=${fingerprintId.replace(/-/g, '').slice(0, 16)}`,
    `--user-agent-product=Chrome/${browserVersion.split('.')[0] ?? '131'}`,
  ];
}
