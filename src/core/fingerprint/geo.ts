import type { GeoIpResult, BrowserProfile, ProxyConfig } from '../../types/profile.js';
import type { ProxyHealthResult } from '../../types/phase4.js';
import { checkIp } from '../proxy/ip-checker.js';

export type PreviewGeoSource = 'proxy' | 'network' | 'pending';

export interface PreviewGeoResult {
  geo: GeoIpResult | null;
  source: PreviewGeoSource;
  pending: boolean;
}

export async function lookupGeoFromIp(ip?: string): Promise<GeoIpResult | null> {
  try {
    const res = await checkIp(ip);
    if (!res) return null;
    return {
      ip: res.ip,
      country: res.country,
      countryCode: res.countryCode,
      flag: res.flag,
      region: res.region,
      city: res.city,
      zip: res.zip,
      latitude: res.lat,
      longitude: res.lon,
      timezone: res.timezone,
      languages: countryCodeToLanguages(res.countryCode),
      isp: res.isp,
      org: res.org,
      asn: res.asn,
      asnName: res.asnName,
      isMobile: res.isMobile,
      isProxy: res.isProxy,
      isHosting: res.isHosting,
      riskScore: res.riskScore,
      latencyMs: res.latencyMs,
      source: res.source,
    };
  } catch {
    return null;
  }
}

export function countryCodeToLanguages(code: string): string[] {
  const map: Record<string, string[]> = {
    US: ['en-US', 'en'],
    GB: ['en-GB', 'en'],
    DE: ['de-DE', 'de'],
    FR: ['fr-FR', 'fr'],
    ES: ['es-ES', 'es'],
    IT: ['it-IT', 'it'],
    JP: ['ja-JP', 'ja'],
    KR: ['ko-KR', 'ko'],
    CN: ['zh-CN', 'zh'],
    BR: ['pt-BR', 'pt'],
    RU: ['ru-RU', 'ru'],
    IN: ['en-IN', 'hi-IN'],
    BD: ['bn-BD', 'en-BD'],
  };
  return map[code.toUpperCase()] ?? ['en-US', 'en'];
}

const TZ_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
};

function canonicalTimezone(tz: string): string {
  return TZ_ALIASES[tz] ?? tz;
}

function timezoneOffsetMinutes(tz: string): number | null {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const part = fmt.formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) {
      if (part === 'GMT' || part === 'UTC' || part === '') return 0;
      return null;
    }
    const sign = m[1] === '-' ? -1 : 1;
    const hours = Number(m[2]);
    const mins = Number(m[3] ?? 0);
    return sign * (hours * 60 + mins);
  } catch {
    return null;
  }
}

function timezonesMatch(a: string, b: string): boolean {
  const ca = canonicalTimezone(a);
  const cb = canonicalTimezone(b);
  if (ca === cb) return true;
  const offA = timezoneOffsetMinutes(ca);
  const offB = timezoneOffsetMinutes(cb);
  return offA != null && offB != null && offA === offB;
}

function inferCountryFromLang(lang: string): string | null {
  const m = lang.match(/-([A-Z]{2})$/i);
  return m ? m[1].toUpperCase() : null;
}

export interface ProxyGeoValidation {
  ok: boolean;
  error?: string;
  warning?: string;
}

/** Build geo from a live proxy health check (uses proxy exit timezone directly). */
export function geoFromProxyHealth(health: ProxyHealthResult): GeoIpResult | null {
  if (!health.exitIp || !health.timezone) return null;
  const countryCode = (health.countryCode ?? '').toUpperCase();
  return {
    ip: health.exitIp,
    country: health.country ?? '',
    countryCode,
    city: health.city ?? '',
    latitude: 0,
    longitude: 0,
    timezone: health.timezone,
    languages: countryCodeToLanguages(countryCode || 'US'),
    isp: health.isp,
    asn: health.asn,
    asnName: health.asnName,
    isProxy: health.isProxy,
    isHosting: health.isHosting,
    riskScore: health.riskScore,
    latencyMs: health.latencyMs,
    source: 'proxy-health',
  };
}

export interface ResolvePreviewGeoOptions {
  proxyMode: 'none' | 'saved' | 'new';
  proxy?: ProxyConfig;
  /** Cached exit IP from a previously checked saved proxy. */
  savedProxyExitIp?: string;
  alignGeo?: boolean;
  checkProxy: (proxy: ProxyConfig) => Promise<ProxyHealthResult>;
}

/**
 * Resolves timezone/language for fingerprint preview.
 * When proxy mode is active, does not silently fall back to the machine's public IP.
 */
export async function resolvePreviewGeo(opts: ResolvePreviewGeoOptions): Promise<PreviewGeoResult> {
  const wantsProxyGeo = opts.proxyMode !== 'none' && opts.alignGeo !== false;

  if (wantsProxyGeo && opts.proxy?.host && opts.proxy.port) {
    const health = await opts.checkProxy(opts.proxy).catch(() => null);
    if (health?.online && health.exitIp) {
      const geo = geoFromProxyHealth(health) ?? await lookupGeoFromIp(health.exitIp).catch(() => null);
      if (geo) return { geo, source: 'proxy', pending: false };
    }
    if (opts.savedProxyExitIp) {
      const geo = await lookupGeoFromIp(opts.savedProxyExitIp).catch(() => null);
      if (geo) return { geo, source: 'proxy', pending: false };
    }
    return { geo: null, source: 'pending', pending: true };
  }

  const geo = await lookupGeoFromIp().catch(() => null);
  return { geo, source: 'network', pending: false };
}

/** Block launch when proxy exit geo timezone disagrees with profile (after health-check alignment). */
export async function validateProxyGeoAlignment(
  profile: BrowserProfile,
  proxy: ProxyConfig,
): Promise<ProxyGeoValidation> {
  if (!proxy.host || !proxy.port) return { ok: true };

  if (!proxy.ip) {
    return {
      ok: true,
      warning: 'Proxy exit IP unknown — timezone/country alignment unverified. Run proxy health check before relying on geo consistency.',
    };
  }

  const geo = await lookupGeoFromIp(proxy.ip);
  if (!geo) {
    return {
      ok: true,
      warning: `Could not resolve geo for proxy IP ${proxy.ip} — timezone/country alignment unverified.`,
    };
  }

  const tz = profile.fingerprint.timeZone;
  if (!timezonesMatch(geo.timezone, tz)) {
    return {
      ok: false,
      error: `Profile timezone "${tz}" does not match proxy exit offset (${geo.timezone}, ${geo.country}/${geo.city}). Re-run proxy health check to auto-align.`,
    };
  }

  const expectedCountry = (proxy.country && /^[A-Za-z]{2}$/.test(proxy.country.trim())
    ? proxy.country.trim().toUpperCase()
    : inferCountryFromLang(profile.fingerprint.screenLang));
  if (expectedCountry && geo.countryCode && geo.countryCode.toUpperCase() !== expectedCountry) {
    return {
      ok: false,
      error: `Profile country "${expectedCountry}" does not match proxy exit "${geo.countryCode}" (${geo.country}). Update proxy or regenerate profile geo.`,
    };
  }

  return { ok: true };
}
