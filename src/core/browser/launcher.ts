import { chromium, type BrowserContext } from 'playwright-core';
import path from 'path';
import fs from 'fs/promises';
import net from 'net';
import type { BrowserProfile, LaunchResult, ProxyConfig } from '../../types/profile.js';
import type { CdpEndpoint } from '../../types/phase4.js';
import type { WarmupResult } from '../../types/warmup.js';
import { buildFingerprintScript, buildLaunchArgs, buildNetworkHeaders } from '../fingerprint/injection.js';
import {
  buildCanonicalFingerprint,
  canonicalToCdpUserAgentMetadata,
  isIosOnChromium,
} from '../fingerprint/canonical-fingerprint.js';
import { resolveChromium, getChromiumInstallHint, checkTlsReadiness, isPatchedSource, requirePatchedChromium } from '../fingerprint/chromium-resolver.js';
import { validateFingerprintQuick } from '../fingerprint/validator.js';
import { validateFingerprintExternal, validateFingerprintQuickExternal } from '../fingerprint/external-validator.js';
import { FP_LAUNCH_GATE_DESCRIPTION, FP_LAUNCH_GATE_SCOPE } from '../fingerprint/antidetect-policy.js';
import { networkFingerprintWarnings } from '../fingerprint/network-limitations.js';
import { validateProxyGeoAlignment } from '../fingerprint/geo.js';
import { warmupRunner } from '../automation/warmup-runner.js';
import { rpaRecorder } from '../automation/rpa-recorder.js';
import { rpaPlayer } from '../automation/rpa-player.js';
import type { RpaScript, RpaReplayResult, RpaRecordingState, RpaAction } from '../../types/rpa.js';
import type { ExtensionLoader } from '../extensions/extension-loader.js';
import {
  exportCookiesJson,
  exportCookiesNetscape,
  importCookiesJson,
  importCookiesNetscape,
} from '../cookies/cookie-manager.js';
import { joinChromeExtensionArgs } from './chrome-path.js';
import { ensureProfileSearchReady, ensureChromiumInstallSearchDefaults } from './search-setup.js';
import { formatLaunchError } from '../../utils/launch-error.js';
import { computeLaunchViewport, computeLaunchInnerViewport, shouldMaximizeLaunchWindow } from '../../utils/resolution.js';
import { resolveStartupUrls } from '../../constants/startup.js';

const launchLocks = new Map<string, Promise<LaunchResult>>();

const runningContexts = new Map<string, BrowserContext>();
const cdpPorts = new Map<string, number>();
const allocatedPorts = new Set<number>();
let nextDebugPort = 9222;
let portAllocationLock: Promise<void> = Promise.resolve();

async function allocateDebugPort(): Promise<number> {
  let resolvePort: (p: number) => void = () => {};
  const portPromise = new Promise<number>((r) => { resolvePort = r; });
  portAllocationLock = portAllocationLock.then(async () => {
    let port = await findFreePort(nextDebugPort);
    while (allocatedPorts.has(port)) {
      port = await findFreePort(port + 1);
    }
    allocatedPorts.add(port);
    nextDebugPort = port + 1;
    resolvePort(port);
  });
  return portPromise;
}

function buildProxyOption(proxy: ProxyConfig) {
  if (!proxy.host || !proxy.port) return undefined;
  const scheme = proxy.type?.toLowerCase().includes('socks') ? 'socks5' : 'http';
  return {
    server: `${scheme}://${proxy.host}:${proxy.port}`,
    username: proxy.account || undefined,
    password: proxy.password || undefined,
  };
}

async function findFreePort(start = 9222): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error(`No free debug port found in range ${start} to ${start + 199}`);
}

async function applyCdpUserAgentOverride(context: BrowserContext, profile: BrowserProfile): Promise<void> {
  const cf = buildCanonicalFingerprint(profile.fingerprint, profile.fingerprintId);
  const page = context.pages().find((p) => !p.isClosed()) ?? await context.newPage();
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setUserAgentOverride', {
      userAgent: cf.ua,
      userAgentMetadata: canonicalToCdpUserAgentMetadata(cf),
    });
  } finally {
    await cdp.detach().catch(() => {});
  }
}

export class BrowserLauncher {
  private onProfileClose?: (profileId: string) => Promise<void>;
  private extensionLoader: ExtensionLoader | null = null;

  setExtensionLoader(loader: ExtensionLoader): void {
    this.extensionLoader = loader;
  }

  setOnProfileClose(cb: (profileId: string) => Promise<void>): void {
    this.onProfileClose = cb;
  }

  getContext(profileId: string): BrowserContext | undefined {
    return runningContexts.get(profileId);
  }

  async launch(
    profile: BrowserProfile,
    dataDir: string,
    proxyOverride?: ProxyConfig,
    options?: { enableCdp?: boolean; displaySize?: { width: number; height: number } },
  ): Promise<LaunchResult> {
    const inFlight = launchLocks.get(profile.id);
    if (inFlight) return inFlight;

    const promise = this.launchInternal(profile, dataDir, proxyOverride, options);
    launchLocks.set(profile.id, promise);
    try {
      return await promise;
    } finally {
      launchLocks.delete(profile.id);
    }
  }

  private async launchInternal(
    profile: BrowserProfile,
    dataDir: string,
    proxyOverride?: ProxyConfig,
    options?: { enableCdp?: boolean; displaySize?: { width: number; height: number } },
  ): Promise<LaunchResult> {
    try {
      if (runningContexts.has(profile.id)) {
        const info = resolveChromium();
        return {
          success: true,
          profileId: profile.id,
          chromiumSource: info?.source,
          tlsReady: checkTlsReadiness(profile.fingerprint.sslFingerprint, info?.source ?? null).ready,
        };
      }

      const fp = profile.fingerprint;
      if (isIosOnChromium(fp)) {
        return {
          success: false,
          profileId: profile.id,
          error: 'iOS profile uses a Safari user-agent on Chromium (instant detection). Recreate the profile or regenerate fingerprint.',
        };
      }

      const userDataDir = path.join(dataDir, 'profiles', profile.id, 'browser-data');
      await fs.mkdir(userDataDir, { recursive: true });

      const chromiumInfo = resolveChromium();
      if (!chromiumInfo) {
        return { success: false, profileId: profile.id, error: getChromiumInstallHint() };
      }

      await ensureChromiumInstallSearchDefaults(chromiumInfo.path).catch(() => {});

      const patched = requirePatchedChromium(chromiumInfo.source);
      if (!patched.ok) {
        return { success: false, profileId: profile.id, error: patched.error, chromiumSource: chromiumInfo.source };
      }

      const tls = checkTlsReadiness(profile.fingerprint.sslFingerprint, chromiumInfo.source);
      if (!tls.ready) {
        return {
          success: false,
          profileId: profile.id,
          error: tls.warning,
          tlsReady: false,
          tlsWarning: tls.warning,
          chromiumSource: chromiumInfo.source,
        };
      }

      const activeProxy = proxyOverride ?? profile.proxy;
      const isMobile = fp.formFactor === 'mobile';
      const useNativeKernel = isPatchedSource(chromiumInfo.source);
      const enableCdp = options?.enableCdp ?? profile.enableCdp ?? false;

      const geoCheck = await validateProxyGeoAlignment(profile, activeProxy);
      if (!geoCheck.ok) {
        return { success: false, profileId: profile.id, error: geoCheck.error };
      }

      const hasProxy = !!(activeProxy.host && activeProxy.port);
      const isSocks = !!activeProxy.type?.toLowerCase().includes('socks');
      if (isSocks && (activeProxy.account || activeProxy.password) && activeProxy.host) {
        return {
          success: false,
          profileId: profile.id,
          error: 'Chromium cannot authenticate SOCKS5 proxies with a username/password. Use an HTTP/HTTPS proxy, or a SOCKS5 proxy that authorizes your IP (no login).',
        };
      }

      // HTTP/HTTPS proxies go through Playwright (handles auth). SOCKS5 proxies are passed as a
      // launch arg instead, because Playwright injects a `--host-resolver-rules=MAP * ~NOTFOUND`
      // DNS blocker for socks5 that breaks all navigation on fingerprint-chromium. socks5:// in
      // --proxy-server already resolves DNS remotely, so no leak-protection is lost.
      const headed = !(profile.headless ?? false);
      if (headed && hasProxy && !isSocks && (activeProxy.account || activeProxy.password)) {
        return {
          success: false,
          profileId: profile.id,
          error: 'Authenticated HTTP proxies are not supported in headed mode. Use a SOCKS5 proxy, an IP-whitelisted HTTP proxy, or launch headless.',
        };
      }
      const usePlaywrightProxy = hasProxy && !isSocks && !headed;
      const proxy = usePlaywrightProxy ? buildProxyOption(activeProxy) : undefined;
      const launchProfile = { ...profile, proxy: activeProxy };
      const launchViewport = computeLaunchViewport(fp, options?.displaySize);
      const launchInner = computeLaunchInnerViewport(fp, options?.displaySize);
      const maximize = shouldMaximizeLaunchWindow(fp);
      const args = [...buildLaunchArgs(launchProfile, profile.fingerprintId, {
        skipProxyArg: usePlaywrightProxy,
        launchSize: launchViewport,
        maximize,
      })];
      let debugPort: number | undefined;

      if (enableCdp && !headed) {
        debugPort = await allocateDebugPort();
        args.push(`--remote-debugging-port=${debugPort}`);
      }

      let extPaths: string[] = [];
      if (this.extensionLoader && profile.extensions.length > 0) {
        extPaths.push(...await this.extensionLoader.resolvePaths(profile.extensions));
      }
      if (extPaths.length > 0) {
        if (this.extensionLoader) {
          args.push(...this.extensionLoader.buildChromeArgs(extPaths));
        } else {
          args.push(...joinChromeExtensionArgs(extPaths));
        }
      }

      await ensureProfileSearchReady(userDataDir);

      let context: BrowserContext | null = null;

      const openPlaywrightContext = async (headless: boolean): Promise<BrowserContext> => {
        const launchArgs = [...args];
        if (headed && debugPort == null) {
          debugPort = await allocateDebugPort();
          launchArgs.push(`--remote-debugging-port=${debugPort}`);
        } else if (debugPort != null) {
          launchArgs.push(`--remote-debugging-port=${debugPort}`);
        }
        return chromium.launchPersistentContext(userDataDir, {
          executablePath: chromiumInfo.path,
          headless,
          chromiumSandbox: true,
          ignoreDefaultArgs: ['--enable-automation', '--no-sandbox', '--auto-open-devtools-for-tabs'],
          args: headless ? [...launchArgs, '--headless=new'] : launchArgs,
          viewport: isMobile ? launchViewport : null,
          userAgent: fp.userAgent,
          locale: fp.screenLang,
          timezoneId: fp.timeZone,
          isMobile,
          hasTouch: isMobile,
          ...(isMobile ? { deviceScaleFactor: fp.devicePixelRatio ?? 3 } : {}),
          geolocation: fp.latitude != null && fp.longitude != null
            ? { latitude: fp.latitude, longitude: fp.longitude }
            : undefined,
          permissions: fp.latitude != null ? ['geolocation'] : [],
          ignoreHTTPSErrors: profile.ignoreHTTPSErrors ?? false,
          extraHTTPHeaders: buildNetworkHeaders(fp, profile.fingerprintId),
          ...(proxy ? { proxy } : {}),
        });
      };

      try {
        context = await openPlaywrightContext(!headed);
        if (headed) {
          for (const page of context.pages()) {
            try {
              const cdp = await context.newCDPSession(page);
              await cdp.send('Emulation.clearDeviceMetricsOverride');
              await cdp.detach();
            } catch {
              // non-fatal
            }
          }
        }

        await applyCdpUserAgentOverride(context, profile);

        await context.addInitScript({
          content: buildFingerprintScript(fp, profile.fingerprintId, activeProxy.ip, {
            useNativeKernel,
            launchViewport: launchInner,
          }),
        });

        const startupUrls = resolveStartupUrls(profile.openUrls);
        const firstPage = context.pages()[0] ?? await context.newPage();
        await firstPage.goto(startupUrls[0]).catch(() => {});
        for (const url of startupUrls.slice(1)) {
          const page = await context.newPage();
          await page.goto(url).catch(() => {});
        }

        runningContexts.set(profile.id, context);
        if (debugPort != null) cdpPorts.set(profile.id, debugPort);

        const currentPort = debugPort;
        context.on('close', async () => {
          runningContexts.delete(profile.id);
          cdpPorts.delete(profile.id);
          if (currentPort != null) allocatedPorts.delete(currentPort);
          if (this.onProfileClose) {
            await this.onProfileClose(profile.id).catch(() => {});
          }
        });
      } catch (err) {
        if (context) {
          await context.close().catch(() => {});
        }
        if (debugPort != null) {
          allocatedPorts.delete(debugPort);
        }
        throw err;
      }

      let warmupStarted = false;
      if (profile.warmupOnLaunch && profile.warmupPresetId) {
        warmupStarted = true;
        void warmupRunner.run(context, profile.warmupPresetId).catch(() => {});
      }

      let fpScore: number | undefined;
      if (profile.minFpScore > 0) {
        const page = context.pages()[0];
        if (page) {
          const report = await validateFingerprintQuickExternal(page);
          fpScore = report.detectionScore ?? report.score;
          if (fpScore < profile.minFpScore) {
            runningContexts.delete(profile.id);
            cdpPorts.delete(profile.id);
            if (debugPort != null) allocatedPorts.delete(debugPort);
            await context.close().catch(() => {});
            return {
              success: false,
              profileId: profile.id,
              error: `Launch gate score ${fpScore}% below minimum ${profile.minFpScore}% (${FP_LAUNCH_GATE_SCOPE} — not CreepJS/Pixelscan)`,
              fpScore,
              fpGateScope: FP_LAUNCH_GATE_SCOPE,
            };
          }
        }
      }

      const warnings = [
        ...(!useNativeKernel ? ['Running degraded JS fallback — install patched fingerprint-chromium for best results'] : []),
        ...(geoCheck.warning ? [geoCheck.warning] : []),
        ...networkFingerprintWarnings(),
      ];

      return {
        success: true,
        profileId: profile.id,
        chromiumSource: chromiumInfo.source,
        cdpPort: debugPort,
        tlsReady: true,
        warmupStarted,
        fpScore,
        antidetectWarnings: warnings.length > 0 ? warnings : undefined,
        fpGateScope: profile.minFpScore > 0 ? FP_LAUNCH_GATE_SCOPE : undefined,
        fpGateNote: profile.minFpScore > 0 ? FP_LAUNCH_GATE_DESCRIPTION : undefined,
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error('Profile launch failed:', raw);
      return {
        success: false,
        profileId: profile.id,
        error: formatLaunchError(raw),
      };
    }
  }

  /** Opens a URL in a new tab of the running profile (used by fingerprint checks). */
  async openProfileUrl(profileId: string, url: string): Promise<boolean> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return false;
    const page = await ctx.newPage();
    await page.goto(url).catch(() => {});
    await page.bringToFront().catch(() => {});
    return true;
  }

  async exportCookies(profileId: string, format: 'json' | 'netscape', outPath: string): Promise<number | null> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return null;
    if (format === 'json') return exportCookiesJson(ctx, outPath);
    return exportCookiesNetscape(ctx, outPath);
  }

  async importCookies(profileId: string, format: 'json' | 'netscape', filePath: string): Promise<number | null> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return null;
    if (format === 'json') return importCookiesJson(ctx, filePath);
    return importCookiesNetscape(ctx, filePath);
  }

  async runWarmup(profileId: string, presetId: string): Promise<WarmupResult | null> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return null;
    return warmupRunner.run(ctx, presetId);
  }

  async validate(profileId: string, external = false): Promise<import('../fingerprint/external-validator.js').ExternalValidationReport | import('../fingerprint/validator.js').ValidationReport | null> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return null;
    const valPage = await ctx.newPage();
    try {
      if (external) return await validateFingerprintExternal(valPage);
      return await validateFingerprintQuick(valPage);
    } finally {
      await valPage.close().catch(() => {});
    }
  }

  async startRpaRecording(profileId: string): Promise<RpaRecordingState | null> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return null;
    return rpaRecorder.start(ctx, profileId);
  }

  stopRpaRecording(): { actions: RpaAction[]; durationMs: number } {
    return rpaRecorder.stop();
  }

  getRpaRecordingState(): RpaRecordingState {
    return rpaRecorder.getState();
  }

  async replayRpa(profileId: string, script: RpaScript): Promise<RpaReplayResult | null> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return null;
    return rpaPlayer.replay(ctx, script);
  }

  getCdpEndpoint(profileId: string): CdpEndpoint | null {
    const port = cdpPorts.get(profileId);
    if (!port || !runningContexts.has(profileId)) return null;
    return {
      profileId,
      port,
      wsUrl: `ws://127.0.0.1:${port}/devtools/browser`,
    };
  }

  async fetchCdpWebSocketUrl(profileId: string): Promise<string | null> {
    const port = cdpPorts.get(profileId);
    if (!port) return null;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await res.json() as { webSocketDebuggerUrl?: string };
      return data.webSocketDebuggerUrl ?? null;
    } catch {
      return null;
    }
  }

  async close(profileId: string): Promise<void> {
    const ctx = runningContexts.get(profileId);
    const port = cdpPorts.get(profileId);
    runningContexts.delete(profileId);
    cdpPorts.delete(profileId);
    if (port != null) allocatedPorts.delete(port);
    if (ctx) {
      await ctx.close().catch(() => {});
    }
  }

  isRunning(profileId: string): boolean {
    return runningContexts.has(profileId);
  }

  get activeContexts(): Map<string, BrowserContext> {
    return runningContexts;
  }

  getActiveProfileIds(): string[] {
    return [...runningContexts.keys()];
  }

  getChromiumInfo() {
    return resolveChromium();
  }
}
