import type { BrowserProfile, ProxyConfig } from '../../types/profile.js';
import type { SavedProxy } from '../../types/phase4.js';
import type { ProxyManager } from './proxy-manager.js';
import { pickRotatingProxy } from './residential-providers.js';
import { alignFingerprintWithGeo } from '../fingerprint/generator.js';
import type { GeoIpResult } from '../../types/profile.js';
import { lookupGeoFromIp } from '../fingerprint/geo.js';

export async function resolveLaunchProxy(
  profile: BrowserProfile,
  proxyManager: ProxyManager,
): Promise<{ proxy: ProxyConfig; savedId?: string }> {
  const base = { ...profile.proxy };

  if (base.rotationMode !== 'off' && profile.proxyPoolIds.length > 0) {
    const pool: SavedProxy[] = [];
    for (const id of profile.proxyPoolIds) {
      const saved = await proxyManager.get(id);
      if (saved) pool.push(saved);
    }
    const mode = base.rotationMode === 'session' ? 'session' : 'random';
    const picked = pickRotatingProxy(pool, mode);
    if (picked) {
      return {
        proxy: { ...picked.proxy, rotationMode: base.rotationMode, poolId: picked.id },
        savedId: picked.id,
      };
    }
  }

  if (base.poolId) {
    const saved = await proxyManager.get(base.poolId);
    if (saved) {
      return {
        proxy: { ...saved.proxy, rotationMode: base.rotationMode, poolId: base.poolId },
        savedId: base.poolId,
      };
    }
  }

  return { proxy: base };
}

export async function alignProfileWithProxyIp(
  profile: BrowserProfile,
  exitIp: string,
): Promise<BrowserProfile> {
  const geo = await lookupGeoFromIp(exitIp);
  if (!geo) return profile;
  profile.fingerprint = alignFingerprintWithGeo(profile.fingerprint, geo);
  profile.proxy.ip = exitIp;
  profile.proxy.country = geo.country;
  profile.proxy.city = geo.city;
  profile.proxy.timezone = geo.timezone;
  return profile;
}

export async function prepareProfileForLaunch(
  profile: BrowserProfile,
  proxyManager: ProxyManager,
): Promise<{ profile: BrowserProfile; activeProxy: ProxyConfig }> {
  const updated = structuredClone(profile);
  const { proxy, savedId } = await resolveLaunchProxy(updated, proxyManager);
  updated.proxy = proxy;

  if (savedId) {
    const health = await proxyManager.checkHealth(savedId);
    if (health.exitIp) {
      await alignProfileWithProxyIp(updated, health.exitIp);
    }
  } else if (proxy.host && proxy.port) {
    const health = await proxyManager.checkProxyConfig('inline', proxy);
    if (health.exitIp) {
      await alignProfileWithProxyIp(updated, health.exitIp);
    }
  } else if (proxy.ip) {
    await alignProfileWithProxyIp(updated, proxy.ip);
  }

  return { profile: updated, activeProxy: proxy };
}

export type { GeoIpResult };
