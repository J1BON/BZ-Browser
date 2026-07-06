import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import https from 'https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { v4 as uuidv4 } from 'uuid';
import { SavedProxySchema, type SavedProxy, type ProxyHealthResult } from '../../types/phase4.js';
import type { ProxyConfig } from '../../types/profile.js';
import { checkIp } from './ip-checker.js';

export class ProxyManager {
  private dataDir: string;
  private proxiesPath: string;
  private proxiesTmpPath: string;
  /** In-process write mutex */
  private writeLock: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.proxiesPath = path.join(dataDir, 'proxies.json');
    this.proxiesTmpPath = path.join(dataDir, 'proxies.json.tmp');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    // Use { flag: 'wx' } to create only if absent — avoids TOCTOU race with fs.access
    await fs.writeFile(this.proxiesPath, JSON.stringify({ proxies: [] }, null, 2), { flag: 'wx' }).catch(() => {});
  }

  async list(): Promise<SavedProxy[]> {
    try {
      const raw = JSON.parse(await fs.readFile(this.proxiesPath, 'utf-8')) as { proxies: SavedProxy[] };
      return Array.isArray(raw?.proxies) ? raw.proxies : [];
    } catch {
      console.warn('[ProxyManager] proxies.json unreadable or corrupt — returning empty list');
      return [];
    }
  }

  async save(proxy: SavedProxy): Promise<SavedProxy[]> {
    return this.withWriteLock(async () => {
      const validated = SavedProxySchema.parse(proxy);
      const all = await this.list();
      const idx = all.findIndex((p) => p.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await this.writeProxies(all);
      return all;
    });
  }

  async create(name: string, proxy: ProxyConfig): Promise<SavedProxy[]> {
    return this.save({
      id: uuidv4(),
      name,
      proxy,
      tags: [],
      lastStatus: 'unknown',
    });
  }

  async remove(id: string): Promise<SavedProxy[]> {
    return this.withWriteLock(async () => {
      const all = (await this.list()).filter((p) => p.id !== id);
      await this.writeProxies(all);
      return all;
    });
  }

  async get(id: string): Promise<SavedProxy | null> {
    return (await this.list()).find((p) => p.id === id) ?? null;
  }

  async checkHealth(id: string): Promise<ProxyHealthResult> {
    const saved = await this.get(id);
    if (!saved) return { id, online: false, latencyMs: 0, error: 'Proxy not found' };
    return this.checkProxyConfig(saved.id, saved.proxy, saved.name);
  }

  async checkProxyConfig(id: string, proxy: ProxyConfig, _name?: string): Promise<ProxyHealthResult> {
    const start = Date.now();

    if (!proxy.host || !proxy.port) {
      return { id, online: false, latencyMs: 0, error: 'Missing host or port' };
    }

    const tcpOk = await tcpConnect(proxy.host, Number(proxy.port), 5000);
    if (!tcpOk) {
      const latencyMs = Date.now() - start; // Capture once, reuse
      if (id !== 'inline') await this.updateHealth(id, { online: false, latencyMs, error: 'TCP connection failed' });
      return { id, online: false, latencyMs, error: 'TCP connection failed' };
    }

    try {
      const data = await fetchGeoThroughProxy(proxy, 10000);
      const latencyMs = Date.now() - start; // Capture once
      const exitIp = String(data.ip ?? data.query ?? '');
      const country = String(data.country ?? data.country_name ?? '');
      const countryCode = String(data.countryCode ?? data.country_code ?? '');
      const city = String(data.city ?? '');
      const timezone = String(data.timezone ?? data.time_zone ?? '');
      const isp = String(data.isp ?? data.org ?? '');
      const asn = String(data.as ?? '');
      const asnName = String(data.asname ?? '');
      const isProxy = !!(data.proxy);
      const isHosting = !!(data.hosting);

      // Risk score: proxy flag = 60pts, hosting = 30pts, remaining = latency penalty
      const riskScore = Math.min(100, (isProxy ? 60 : 0) + (isHosting ? 30 : 0) + (latencyMs > 1000 ? 10 : 0));

      const result: ProxyHealthResult = {
        id, online: true, latencyMs, exitIp, country, countryCode, city, timezone, isp, asn, asnName, isProxy, isHosting, riskScore,
      };

      if (id !== 'inline') {
        // Update health in-place under write lock — avoids re-fetch
        await this.withWriteLock(async () => {
          const all = await this.list();
          const idx = all.findIndex((p) => p.id === id);
          if (idx >= 0) {
            all[idx].lastChecked = Date.now();
            all[idx].lastLatencyMs = latencyMs;
            all[idx].lastStatus = 'online';
            all[idx].exitIp = exitIp;
            all[idx].country = country;
            await this.writeProxies(all);
          }
        });
      }

      return result;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const error = err instanceof Error ? err.message : String(err);
      if (id !== 'inline') await this.updateHealth(id, { online: false, latencyMs, error });
      return { id, online: false, latencyMs, error };
    }
  }

  async checkAll(): Promise<ProxyHealthResult[]> {
    const all = await this.list();
    // Run in parallel for speed
    const results = await Promise.allSettled(all.map((p) => this.checkHealth(p.id)));
    return results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { id: all[i].id, online: false, latencyMs: 0, error: 'Check failed' }
    );
  }

  async alignProfileWithProxy(exitIp: string) {
    return checkIp(exitIp);
  }

  private async updateHealth(id: string, partial: Partial<ProxyHealthResult>): Promise<void> {
    await this.withWriteLock(async () => {
      const all = await this.list();
      const idx = all.findIndex((p) => p.id === id);
      if (idx < 0) return;
      all[idx].lastChecked = Date.now();
      all[idx].lastLatencyMs = partial.latencyMs;
      all[idx].lastStatus = partial.online ? 'online' : 'offline';
      if (partial.exitIp) all[idx].exitIp = partial.exitIp;
      if (partial.country) all[idx].country = partial.country;
      await this.writeProxies(all);
    });
  }

  /** Atomic write for proxies.json */
  private async writeProxies(proxies: SavedProxy[]): Promise<void> {
    await fs.writeFile(this.proxiesTmpPath, JSON.stringify({ proxies }, null, 2), 'utf-8');
    await fs.rename(this.proxiesTmpPath, this.proxiesPath);
  }

  private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeLock.then(fn);
    this.writeLock = next.then(() => undefined, () => undefined);
    return next;
  }
}

function buildProxyUrl(proxy: ProxyConfig): string {
  const scheme = proxy.type?.toLowerCase().includes('socks') ? 'socks5h' : 'http';
  const auth = proxy.account && proxy.password
    ? `${encodeURIComponent(proxy.account)}:${encodeURIComponent(proxy.password)}@`
    : '';
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

const GEO_LOOKUP_URL = 'http://ip-api.com/json/?fields=66846719';

async function fetchGeoThroughProxy(proxy: ProxyConfig, timeoutMs: number): Promise<Record<string, unknown>> {
  const isSocks = !!proxy.type?.toLowerCase().includes('socks');
  if (isSocks) {
    const agent = new SocksProxyAgent(buildProxyUrl(proxy), { timeout: timeoutMs });
    const body = await new Promise<string>((resolve, reject) => {
      const req = https.get(GEO_LOOKUP_URL.replace('http:', 'https:'), { agent }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return;
        }
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error('Proxy timeout')));
    });
    return JSON.parse(body) as Record<string, unknown>;
  }

  const { fetch, ProxyAgent } = await import('undici');
  const agent = new ProxyAgent(buildProxyUrl(proxy));
  const res = await fetch(GEO_LOOKUP_URL, { dispatcher: agent, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as Record<string, unknown>;
}

function tcpConnect(host: string, port: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => { socket.destroy(); resolve(true); });
    socket.setTimeout(timeout);
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
  });
}

export { buildProxyUrl };
