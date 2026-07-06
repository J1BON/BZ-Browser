import type { BrowserProfile, FingerprintConfig } from '../../types/profile.js';
import { buildTlsLaunchArgs } from './tls-profiles.js';
import { buildInjectionRuntimeScript } from './injection-runtime.js';
import {
  buildCanonicalFingerprint,
  type CanonicalFingerprint,
} from './canonical-fingerprint.js';

/** Maps a profile device to a fingerprint-chromium `--fingerprint-platform` value. */
function kernelPlatform(device: FingerprintConfig['device']): 'windows' | 'macos' | 'linux' | null {
  if (device === 'Windows') return 'windows';
  if (device === 'MacOS') return 'macos';
  if (device === 'Linux') return 'linux';
  // Android/iOS have no native kernel platform target — rely on UA-CH + emulation.
  return null;
}

/**
 * Native fingerprint-chromium kernel flags. These drive OS/brand/timezone/CPU at the
 * C++ layer so they match the CDP UA-CH override and JS layer (a mismatch here is the
 * #1 reason profiles get flagged by CreepJS/Pixelscan). All values come from the same
 * canonical fingerprint to guarantee cross-layer consistency.
 */
export function buildKernelFingerprintArgs(cf: CanonicalFingerprint, fp: FingerprintConfig): string[] {
  const args: string[] = [];
  const platform = kernelPlatform(fp.device);
  if (platform) {
    args.push(`--fingerprint-platform=${platform}`);
    if (cf.platformVersion) args.push(`--fingerprint-platform-version=${cf.platformVersion}`);
  }
  // Without this the kernel reports brand "Chromium" while our UA says "Google Chrome".
  if (fp.device !== 'iOS') {
    args.push('--fingerprint-brand=Chrome');
    if (cf.uaFullVersion) args.push(`--fingerprint-brand-version=${cf.uaFullVersion}`);
  }
  if (cf.hwConcurrency) args.push(`--fingerprint-hardware-concurrency=${cf.hwConcurrency}`);
  if (cf.tz) args.push(`--timezone=${cf.tz}`);
  if (cf.acceptLanguage) args.push(`--accept-lang=${cf.acceptLanguage}`);
  if (fp.webRTC === '2' || fp.webRTC === '3') args.push('--disable-non-proxied-udp');
  return args;
}

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
  options?: { useNativeKernel?: boolean; launchViewport?: { width: number; height: number } },
): string {
  const FP = buildInjectionPayloadWithProxy(fp, fingerprintId, proxyIp);
  if (options?.launchViewport) {
    FP.innerW = options.launchViewport.width;
    FP.innerH = options.launchViewport.height;
  }
  return buildInjectionRuntimeScript(JSON.stringify(FP), {
    useNativeKernel: options?.useNativeKernel ?? false,
  });
}

export function buildLaunchArgs(
  profile: BrowserProfile,
  fingerprintId?: string,
  options?: { skipProxyArg?: boolean; launchSize?: { width: number; height: number }; maximize?: boolean },
): string[] {
  const fp = profile.fingerprint;
  const isMobile = fp.formFactor === 'mobile';
  const launchW = options?.launchSize?.width ?? fp.windowWidth;
  const launchH = options?.launchSize?.height ?? fp.windowHeight;
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    `--lang=${fp.screenLang}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--disable-sync',
    '--disable-features=ProfilePickerOnStartup,SigninProfileCreation,ChromeWhatsNewUI,ExtensionManifestV3Only,SearchEngineChoiceTrigger,SearchEngineChoice',
    '--exclude-switches=enable-automation',
    '--disable-component-update',
  ];

  if (options?.maximize && !isMobile) {
    args.push('--start-maximized');
  } else {
    args.push(`--window-size=${launchW},${launchH}`);
  }

  const seed = fingerprintId ?? profile.fingerprintId ?? 'default';
  args.push(...buildTlsLaunchArgs(
    fp.tlsProfileId,
    seed,
    fp.device,
    fp.browserVersion,
  ));

  const canonical = buildCanonicalFingerprint(fp, seed);
  args.push(...buildKernelFingerprintArgs(canonical, fp));

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

  if (!options?.skipProxyArg && profile.proxy.host && profile.proxy.port) {
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
