import type { BrowserProfile, FingerprintConfig } from '../../types/profile.js';
import { buildTlsLaunchArgs } from './tls-profiles.js';
import { buildInjectionRuntimeScript } from './injection-runtime.js';
import {
  buildCanonicalFingerprint,
  type CanonicalFingerprint,
} from './canonical-fingerprint.js';

export type { CanonicalFingerprint };
export type InjectionPayload = CanonicalFingerprint;

export function buildInjectionPayload(fp: FingerprintConfig, seed: string): CanonicalFingerprint {
  return buildCanonicalFingerprint(fp, seed);
}

export function buildInjectionPayloadWithProxy(fp: FingerprintConfig, seed: string, proxyIp?: string): CanonicalFingerprint {
  return buildCanonicalFingerprint(fp, seed, proxyIp ?? '');
}

export function buildFingerprintScript(
  fp: FingerprintConfig,
  fingerprintId = 'default',
  proxyIp?: string,
  options?: { useNativeKernel?: boolean },
): string {
  const FP = buildInjectionPayloadWithProxy(fp, fingerprintId, proxyIp);
  return buildInjectionRuntimeScript(JSON.stringify(FP), {
    useNativeKernel: options?.useNativeKernel ?? false,
  });
}

export function buildLaunchArgs(profile: BrowserProfile, fingerprintId?: string): string[] {
  const fp = profile.fingerprint;
  const isMobile = fp.formFactor === 'mobile';
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    `--window-size=${fp.windowWidth},${fp.windowHeight}`,
    `--lang=${fp.screenLang}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--exclude-switches=enable-automation',
    '--disable-component-update',
  ];

  args.push(...buildTlsLaunchArgs(
    fp.tlsProfileId,
    fingerprintId ?? profile.fingerprintId ?? 'default',
    fp.device,
    fp.browserVersion,
  ));

  if (fp.webRTC === '2' || fp.webRTC === '3') {
    args.push(
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--enforce-webrtc-ip-permission-check',
    );
  }

  if (profile.headless) {
    args.push('--headless=new');
  }

  if (fp.hardwareAccelerate === '1') {
    args.push('--enable-gpu-rasterization');
  }

  if (fp.portScanProtection !== '2') {
    args.push('--disable-background-networking');
  }

  if (isMobile) {
    args.push('--enable-touch-events');
  }

  if (profile.proxy.host && profile.proxy.port) {
    const scheme = profile.proxy.type?.toLowerCase().includes('socks') ? 'socks5' : 'http';
    args.push(`--proxy-server=${scheme}://${profile.proxy.host}:${profile.proxy.port}`);
  }

  return args;
}

/** Only Accept-Language — UA/UA-CH set via CDP Network.setUserAgentOverride. */
export function buildNetworkHeaders(fp: FingerprintConfig, seed: string): Record<string, string> {
  const cf = buildCanonicalFingerprint(fp, seed);
  return { 'Accept-Language': cf.acceptLanguage };
}
