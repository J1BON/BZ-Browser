import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { ProxyAgent, fetch } from 'undici';
import { v4 as uuidv4 } from 'uuid';
import { SavedProxySchema, type SavedProxy, type ProxyHealthResult } from '../../types/phase4.js';
import type { ProxyConfig } from '../../types/profile.js';
import { lookupGeoFromIp } from '../fingerprint/geo.js';

export class ProxyManager {
  private dataDir: string;
  private proxiesPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.proxiesPath = path.join(dataDir, 'proxies.json');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      await fs.access(this.proxiesPath);
    } catch {
      await fs.writeFile(this.proxiesPath, JSON.stringify({ proxies: [] }, null, 2));
    }
  }

  async list(): Promise<SavedProxy[]> {
    const raw = JSON.parse(await fs.readFile(this.proxiesPath, 'utf-8')) as { proxies: SavedProxy[] };
    return raw.proxies;
  }

  async save(proxy: SavedProxy): Promise<SavedProxy[]> {
    const validated = SavedProxySchema.parse(proxy);
    const all = await this.list();
    const idx = all.findIndex((p) => p.id === validated.id);
    if (idx >= 0) all[idx] = validated;
    else all.push(validated);
    await fs.writeFile(this.proxiesPath, JSON.stringify({ proxies: all }, null, 2));
    return all;
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
    const all = (await this.list()).filter((p) => p.id !== id);
    await fs.writeFile(this.proxiesPath, JSON.stringify({ proxies: all }, null, 2));
    return all;
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
      await this.updateHealth(id, { online: false, latencyMs: Date.now() - start, error: 'TCP connection failed' });
      return { id, online: false, latencyMs: Date.now() - start, error: 'TCP connection failed' };
    }

    try {
      const proxyUrl = buildProxyUrl(proxy);
      const agent = new ProxyAgent(proxyUrl);
      const res = await fetch('https://api.ip.sb/geoip', {
        dispatcher: agent,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;
      const latencyMs = Date.now() - start;
      const exitIp = String(data.ip ?? '');
      const country = String(data.country ?? data.country_name ?? '');
      const city = String(data.city ?? '');
      const timezone = String(data.timezone ?? data.time_zone ?? '');

      const result: ProxyHealthResult = {
        id,
        online: true,
        latencyMs,
        exitIp,
        country,
        city,
        timezone,
      };

      if (id !== 'inline') {
        const saved = await this.get(id);
        if (saved) {
          saved.lastChecked = Date.now();
          saved.lastLatencyMs = latencyMs;
          saved.lastStatus = 'online';
          saved.exitIp = exitIp;
          saved.country = country;
          await this.save(saved);
        }
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
    const results: ProxyHealthResult[] = [];
    for (const p of all) {
      results.push(await this.checkHealth(p.id));
    }
    return results;
  }

  async alignProfileWithProxy(exitIp: string): Promise<Awaited<ReturnType<typeof lookupGeoFromIp>>> {
    return lookupGeoFromIp(exitIp);
  }

  private async updateHealth(id: string, partial: Partial<ProxyHealthResult>): Promise<void> {
    const saved = await this.get(id);
    if (!saved) return;
    saved.lastChecked = Date.now();
    saved.lastLatencyMs = partial.latencyMs;
    saved.lastStatus = partial.online ? 'online' : 'offline';
    if (partial.exitIp) saved.exitIp = partial.exitIp;
    if (partial.country) saved.country = partial.country;
    await this.save(saved);
  }
}

function buildProxyUrl(proxy: ProxyConfig): string {
  const scheme = proxy.type?.toLowerCase().includes('socks') ? 'socks5' : 'http';
  const auth = proxy.account && proxy.password
    ? `${encodeURIComponent(proxy.account)}:${encodeURIComponent(proxy.password)}@`
    : '';
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

function tcpConnect(host: string, port: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeout);
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
  });
}

export { buildProxyUrl };
