/**
 * Multi-API IP checker used for proxy health checks and profile geo-alignment.
 * Primary: ip-api.com (free, HTTP, 45 req/min)
 * Fallback: ipinfo.io
 * Fallback 2: api.ip.sb
 */

export interface IpCheckResult {
  ip: string;
  country: string;
  countryCode: string;
  flag: string;
  region: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  asn: string;
  asnName: string;
  isMobile: boolean;
  isProxy: boolean;
  isHosting: boolean;
  /** 0-100 risk score: proxy=60pts, hosting=30pts, high latency=10pts */
  riskScore: number;
  latencyMs: number;
  source: 'ip-api' | 'ipinfo' | 'ip.sb';
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', RU: '🇷🇺',
  KR: '🇰🇷', IN: '🇮🇳', BR: '🇧🇷', CA: '🇨🇦', AU: '🇦🇺', NL: '🇳🇱', SG: '🇸🇬',
  HK: '🇭🇰', TW: '🇹🇼', UA: '🇺🇦', PL: '🇵🇱', TR: '🇹🇷', MX: '🇲🇽', AR: '🇦🇷',
  BD: '🇧🇩', PK: '🇵🇰', NG: '🇳🇬', ZA: '🇿🇦', IT: '🇮🇹', ES: '🇪🇸', SE: '🇸🇪',
  NO: '🇳🇴', FI: '🇫🇮', DK: '🇩🇰', CH: '🇨🇭', AT: '🇦🇹', BE: '🇧🇪', PT: '🇵🇹',
  CZ: '🇨🇿', RO: '🇷🇴', HU: '🇭🇺', ID: '🇮🇩', TH: '🇹🇭', VN: '🇻🇳', PH: '🇵🇭',
  MY: '🇲🇾', IL: '🇮🇱', AE: '🇦🇪', SA: '🇸🇦', EG: '🇪🇬', KE: '🇰🇪',
};

function getFlag(countryCode: string): string {
  return COUNTRY_FLAGS[countryCode?.toUpperCase()] ?? '🌐';
}

export async function checkIp(ip?: string): Promise<IpCheckResult | null> {
  const start = Date.now();
  const ipPath = ip ? `/${encodeURIComponent(ip)}` : '';

  // Primary: ip-api.com
  try {
    const url = `http://ip-api.com/json${ipPath}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting,query`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      if (data.status === 'success') {
        const countryCode = String(data.countryCode ?? '');
        const isProxy = !!(data.proxy);
        const isHosting = !!(data.hosting);
        const latencyMs = Date.now() - start;
        const riskScore = Math.min(100, (isProxy ? 60 : 0) + (isHosting ? 30 : 0) + (latencyMs > 1000 ? 10 : 0));
        return {
          ip: String(data.query ?? ip ?? ''),
          country: String(data.country ?? ''),
          countryCode,
          flag: getFlag(countryCode),
          region: String(data.regionName ?? ''),
          city: String(data.city ?? ''),
          zip: String(data.zip ?? ''),
          lat: Number(data.lat ?? 0),
          lon: Number(data.lon ?? 0),
          timezone: String(data.timezone ?? ''),
          isp: String(data.isp ?? ''),
          org: String(data.org ?? ''),
          asn: String(data.as ?? ''),
          asnName: String(data.asname ?? ''),
          isMobile: !!(data.mobile),
          isProxy,
          isHosting,
          riskScore,
          latencyMs,
          source: 'ip-api',
        };
      }
    }
  } catch { /* fall through to next provider */ }

  // Fallback: ipinfo.io
  try {
    const url = ip ? `https://ipinfo.io/${encodeURIComponent(ip)}/json` : 'https://ipinfo.io/json';
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const countryCode = String(data.country ?? '');
      const [lat, lon] = String(data.loc ?? '0,0').split(',').map(Number);
      const latencyMs = Date.now() - start;
      return {
        ip: String(data.ip ?? ip ?? ''),
        country: countryCode, countryCode, flag: getFlag(countryCode),
        region: String(data.region ?? ''), city: String(data.city ?? ''), zip: String(data.postal ?? ''),
        lat: lat ?? 0, lon: lon ?? 0, timezone: String(data.timezone ?? ''),
        isp: String(data.org ?? ''), org: String(data.org ?? ''), asn: '', asnName: '',
        isMobile: false, isProxy: false, isHosting: false, riskScore: 0,
        latencyMs, source: 'ipinfo',
      };
    }
  } catch { /* fall through */ }

  // Fallback 2: api.ip.sb
  try {
    const url = ip ? `https://api.ip.sb/geoip/${encodeURIComponent(ip)}` : 'https://api.ip.sb/geoip';
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const countryCode = String(data.country_code ?? '');
      const latencyMs = Date.now() - start;
      return {
        ip: String(data.ip ?? ip ?? ''),
        country: String(data.country ?? ''), countryCode, flag: getFlag(countryCode),
        region: String(data.region ?? ''), city: String(data.city ?? ''), zip: '',
        lat: Number(data.latitude ?? 0), lon: Number(data.longitude ?? 0),
        timezone: String(data.timezone ?? ''), isp: String(data.isp ?? ''), org: '', asn: '', asnName: '',
        isMobile: false, isProxy: false, isHosting: false, riskScore: 0,
        latencyMs, source: 'ip.sb',
      };
    }
  } catch { /* all providers failed */ }

  return null;
}
