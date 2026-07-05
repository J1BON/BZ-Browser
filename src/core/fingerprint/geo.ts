import type { GeoIpResult, BrowserProfile, ProxyConfig } from '../../types/profile.js';

const IP_LOOKUP_ENDPOINTS = [
  'https://ipapi.co/json/',
  'https://api.ip.sb/geoip',
];

export async function lookupGeoFromIp(ip?: string): Promise<GeoIpResult | null> {
  for (const endpoint of IP_LOOKUP_ENDPOINTS) {
    try {
      const url = ip ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}ip=${ip}` : endpoint;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      return normalizeGeoResponse(data);
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeGeoResponse(data: Record<string, unknown>): GeoIpResult | null {
  const ip = String(data.ip ?? data.query ?? '');
  const country = String(data.country_name ?? data.country ?? '');
  const countryCode = String(data.country_code ?? data.countryCode ?? data.country ?? '');
  const city = String(data.city ?? '');
  const lat = Number(data.latitude ?? data.lat ?? 0);
  const lon = Number(data.longitude ?? data.lon ?? data.lng ?? 0);
  const timezone = String(data.timezone ?? data.time_zone ?? 'UTC');

  if (!ip) return null;

  return {
    ip,
    country,
    countryCode,
    city,
    latitude: lat,
    longitude: lon,
    timezone,
    languages: countryCodeToLanguages(countryCode),
  };
}

function countryCodeToLanguages(code: string): string[] {
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
    if (!m) return 0;
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
