import type { BrowserProfile } from '../types/profile';

export interface FpHealthIssue {
  severity: 'error' | 'warn';
  message: string;
}

export interface FpHealth {
  score: number;
  level: 'strong' | 'fair' | 'weak';
  issues: FpHealthIssue[];
}

const PLATFORM_UA_TOKEN: Record<string, RegExp> = {
  Windows: /Windows NT/i,
  MacOS: /Macintosh|Mac OS X/i,
  Linux: /Linux(?!.*Android)|X11/i,
  Android: /Android/i,
  iOS: /iPhone|iPad|CriOS|CPU (iPhone )?OS/i,
};

/**
 * Deterministic, launch-free coherence audit of a profile's fingerprint config.
 * Flags internal contradictions that detectors (CreepJS/Pixelscan/BrowserScan) exploit,
 * e.g. a UA that disagrees with the declared OS, a missing timezone, or a leaky WebRTC mode.
 */
export function assessFingerprintHealth(profile: BrowserProfile): FpHealth {
  const fp = profile.fingerprint;
  const issues: FpHealthIssue[] = [];

  const major = fp.browserVersion?.split('.')[0];
  if (major && fp.userAgent) {
    const uaHasMajor = fp.userAgent.includes(`/${major}.`) || fp.userAgent.includes(` ${major}.`)
      || (fp.device === 'iOS' && fp.userAgent.includes(`CriOS/${major}.`));
    if (!uaHasMajor) {
      issues.push({ severity: 'error', message: `User-Agent does not match Chrome ${major}` });
    }
  }

  if (fp.device === 'iOS' && /Safari/i.test(fp.userAgent ?? '') && !/CriOS|Chrome/i.test(fp.userAgent ?? '')) {
    issues.push({ severity: 'error', message: 'Safari UA on Chromium engine — use Chrome-iOS (CriOS) profile or regenerate' });
  }

  const token = PLATFORM_UA_TOKEN[fp.device];
  if (token && fp.userAgent && !token.test(fp.userAgent)) {
    issues.push({ severity: 'error', message: `User-Agent OS token does not match ${fp.device}` });
  }

  if (!fp.timeZone) {
    issues.push({ severity: 'error', message: 'No timezone set — Date/Intl will leak the host timezone' });
  }
  if (!fp.screenLang) {
    issues.push({ severity: 'warn', message: 'No language set — falls back to host locale' });
  }

  const hasProxy = !!(profile.proxy?.host && profile.proxy?.port);
  if (!hasProxy) {
    issues.push({ severity: 'warn', message: 'No proxy — real IP/geo will be exposed' });
  }

  if (fp.webRTC === '1') {
    issues.push({ severity: 'error', message: 'WebRTC protection off — local/real IP can leak' });
  }
  if (fp.canvas === '1') {
    issues.push({ severity: 'warn', message: 'Canvas noise disabled — canvas hash is trackable' });
  }
  if (fp.webGlImage === '1') {
    issues.push({ severity: 'warn', message: 'WebGL image noise disabled' });
  }

  const sw = fp.screenWidth ?? fp.windowWidth;
  const sh = fp.screenHeight ?? fp.windowHeight;
  if (sw && sh && (fp.windowWidth > sw || fp.windowHeight > sh)) {
    issues.push({ severity: 'warn', message: 'Window is larger than screen — implausible viewport' });
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  const score = Math.max(0, 100 - errors * 25 - warns * 8);
  const level: FpHealth['level'] = errors > 0 || score < 55 ? 'weak' : score < 85 ? 'fair' : 'strong';

  return { score, level, issues };
}
