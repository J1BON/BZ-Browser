import type { BrowserProfile } from '../types/profile';
import type { SavedProxy } from '../types/phase4';

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Normalize country to 2-letter code when possible */
export function countryCode(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw.length === 2) return raw.toUpperCase();
  const map: Record<string, string> = {
    'united states': 'US', usa: 'US', america: 'US',
    'united kingdom': 'GB', uk: 'GB',
    germany: 'DE', france: 'FR', canada: 'CA', brazil: 'BR',
    indonesia: 'ID', india: 'IN', netherlands: 'NL',
  };
  return map[raw.toLowerCase()] ?? undefined;
}

export interface ProxyDisplay {
  line1: string;
  line2?: string;
  status: 'direct' | 'online' | 'offline' | 'unchecked';
}

export function profileProxyDisplay(profile: BrowserProfile): ProxyDisplay {
  const { proxy } = profile;
  if (!proxy.host?.trim()) {
    return { line1: 'Direct connection', status: 'direct' };
  }

  const exitIp = proxy.ip?.trim();
  const cc = countryCode(proxy.country);
  const loc = [cc, proxy.city].filter(Boolean).join(' / ');

  if (exitIp) {
    return {
      line1: exitIp,
      line2: loc || truncate(`${proxy.host}:${proxy.port}`, 28),
      status: 'online',
    };
  }

  return {
    line1: truncate(`${proxy.host}:${proxy.port}`, 32),
    line2: 'Not verified — run IP check',
    status: 'unchecked',
  };
}

export function savedProxyDisplay(px: SavedProxy): ProxyDisplay {
  if (!px.proxy.host) return { line1: '—', status: 'unchecked' };
  if (px.exitIp) {
    const cc = countryCode(px.country);
    return {
      line1: px.exitIp,
      line2: [cc, px.country, `${px.lastLatencyMs ?? '—'}ms`].filter(Boolean).join(' · '),
      status: px.lastStatus === 'online' ? 'online' : 'offline',
    };
  }
  return {
    line1: truncate(`${px.proxy.host}:${px.proxy.port}`, 36),
    line2: px.lastStatus === 'offline' ? 'Connection failed' : 'Click Check IP',
    status: px.lastStatus === 'online' ? 'online' : px.lastStatus === 'offline' ? 'offline' : 'unchecked',
  };
}

export function deviceLabel(profile: BrowserProfile): string {
  const d = profile.fingerprint.device ?? 'Windows';
  const ff = profile.fingerprint.formFactor ?? 'desktop';
  return ff === 'mobile' ? `${d} Mobile` : d;
}
