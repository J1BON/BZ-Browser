import type { SavedProxy } from '../../types/phase4.js';
import type { ProxyConfig } from '../../types/profile.js';

export interface ResidentialProvider {
  id: string;
  name: string;
  hostTemplate: string;
  port: string;
  type: string;
  docs: string;
}

export const RESIDENTIAL_PROVIDERS: ResidentialProvider[] = [
  {
    id: 'brightdata',
    name: 'Bright Data',
    hostTemplate: 'brd.superproxy.io',
    port: '22225',
    type: 'CustomProxy',
    docs: 'https://docs.brightdata.com/proxy-networks/residential',
  },
  {
    id: 'oxylabs',
    name: 'Oxylabs',
    hostTemplate: 'pr.oxylabs.io',
    port: '7777',
    type: 'CustomProxy',
    docs: 'https://developers.oxylabs.io/proxies/residential-proxies',
  },
  {
    id: 'smartproxy',
    name: 'Smartproxy',
    hostTemplate: 'gate.smartproxy.com',
    port: '7000',
    type: 'CustomProxy',
    docs: 'https://help.smartproxy.com/docs/residential-proxy-quick-start',
  },
  {
    id: 'iproyal',
    name: 'IPRoyal',
    hostTemplate: 'geo.iproyal.com',
    port: '12321',
    type: 'CustomProxy',
    docs: 'https://iproyal.com/proxies/residential-proxies/',
  },
  {
    id: '922proxy',
    name: '922 S5 Proxy',
    hostTemplate: '127.0.0.1',
    port: '1080',
    type: 'Socks5Proxy',
    docs: 'Local SOCKS5 residential gateway',
  },
];

export function buildProviderProxy(
  providerId: string,
  account: string,
  password: string,
  country?: string,
): ProxyConfig | null {
  const p = RESIDENTIAL_PROVIDERS.find((x) => x.id === providerId);
  if (!p) return null;
  let user = account;
  if (providerId === 'brightdata' && country) {
    user = `${account}-country-${country.toLowerCase()}`;
  }
  if (providerId === 'oxylabs' && country) {
    user = `customer-${account}-cc-${country.toLowerCase()}`;
  }
  return {
    category: '4',
    type: p.type,
    host: p.hostTemplate,
    port: p.port,
    account: user,
    password,
    country,
    rotationMode: 'session',
  };
}

export function pickRotatingProxy(pool: SavedProxy[], mode: 'session' | 'random'): SavedProxy | null {
  if (pool.length === 0) return null;
  if (mode === 'session') return pool[Math.floor(Math.random() * pool.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}
