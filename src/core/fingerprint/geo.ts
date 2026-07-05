import type { GeoIpResult } from '../../types/profile.js';

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
