import { chromium, type BrowserContext } from 'playwright-core';
import path from 'path';
import fs from 'fs/promises';
import net from 'net';
import type { BrowserProfile, LaunchResult, ProxyConfig } from '../../types/profile.js';
import type { CdpEndpoint } from '../../types/phase4.js';
import type { WarmupResult } from '../../types/warmup.js';
import { buildFingerprintScript, buildLaunchArgs, buildExtraHeaders } from '../fingerprint/injection.js';
import { resolveChromium, getChromiumInstallHint, checkTlsReadiness } from '../fingerprint/chromium-resolver.js';
import { validateFingerprint, type ValidationReport } from '../fingerprint/validator.js';
import { validateFingerprintExternal } from '../fingerprint/external-validator.js';
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

const runningContexts = new Map<string, BrowserContext>();
const cdpPorts = new Map<string, number>();
let nextDebugPort = 9222;

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
  return start;
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

  async launch(profile: BrowserProfile, dataDir: string, proxyOverride?: ProxyConfig): Promise<LaunchResult> {
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

      const userDataDir = path.join(dataDir, 'profiles', profile.id, 'browser-data');
      await fs.mkdir(userDataDir, { recursive: true });

      const chromiumInfo = resolveChromium();
      if (!chromiumInfo) {
        return { success: false, profileId: profile.id, error: getChromiumInstallHint() };
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
      const fp = profile.fingerprint;
      const isMobile = fp.formFactor === 'mobile';
      // Seed headers with the SAME fingerprintId used by the injected JS so
      // Client Hints match between the network layer and navigator.userAgentData.
      const extraHeaders = {
        ...buildExtraHeaders(fp, profile.fingerprintId),
        'User-Agent': fp.userAgent,
      };

      const debugPort = await findFreePort(nextDebugPort);
      nextDebugPort = debugPort + 1;

      const args = [
        ...buildLaunchArgs(profile, profile.fingerprintId),
        `--remote-debugging-port=${debugPort}`,
      ];

      if (this.extensionLoader && profile.extensions.length > 0) {
        const extPaths = await this.extensionLoader.resolvePaths(profile.extensions);
        args.push(...this.extensionLoader.buildChromeArgs(extPaths));
      }

      const proxy = buildProxyOption(activeProxy);

      const context = await chromium.launchPersistentContext(userDataDir, {
        executablePath: chromiumInfo.path,
        headless: profile.headless ?? false,
        args,
        viewport: { width: fp.windowWidth, height: fp.windowHeight },
        userAgent: fp.userAgent,
        locale: fp.screenLang,
        timezoneId: fp.timeZone,
        isMobile,
        hasTouch: isMobile,
        deviceScaleFactor: fp.devicePixelRatio ?? (isMobile ? 3 : 1),
        geolocation: fp.latitude != null && fp.longitude != null
          ? { latitude: fp.latitude, longitude: fp.longitude }
          : undefined,
        permissions: fp.latitude != null ? ['geolocation'] : [],
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: extraHeaders,
        ...(proxy ? { proxy } : {}),
      });

      await context.addInitScript({
        content: buildFingerprintScript(fp, profile.fingerprintId, activeProxy.ip),
      });

      if (profile.openUrls.length > 0) {
        for (const url of profile.openUrls) {
          const page = await context.newPage();
          await page.goto(url).catch(() => {});
        }
      } else {
        const page = context.pages()[0] ?? await context.newPage();
        await page.goto('about:blank');
      }

      runningContexts.set(profile.id, context);
      cdpPorts.set(profile.id, debugPort);

      context.on('close', async () => {
        runningContexts.delete(profile.id);
        cdpPorts.delete(profile.id);
        if (this.onProfileClose) {
          await this.onProfileClose(profile.id).catch(() => {});
        }
      });

      let warmupStarted = false;
      if (profile.warmupOnLaunch && profile.warmupPresetId) {
        warmupStarted = true;
        void warmupRunner.run(context, profile.warmupPresetId).catch(() => {});
      }

      let fpScore: number | undefined;
      if (profile.minFpScore > 0) {
        const page = context.pages()[0];
        if (page) {
          const report = await validateFingerprint(page);
          fpScore = report.score;
          if (report.score < profile.minFpScore) {
            await context.close();
            return {
              success: false,
              profileId: profile.id,
              error: `Fingerprint score ${report.score}% below minimum ${profile.minFpScore}%`,
              fpScore: report.score,
            };
          }
        }
      }

      return {
        success: true,
        profileId: profile.id,
        chromiumSource: chromiumInfo.source,
        cdpPort: debugPort,
        tlsReady: true,
        warmupStarted,
        fpScore,
      };
    } catch (err) {
      return {
        success: false,
        profileId: profile.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
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

  async validate(profileId: string, external = false): Promise<ValidationReport | null> {
    const ctx = runningContexts.get(profileId);
    if (!ctx) return null;
    const page = ctx.pages()[0];
    if (!page) return null;
    if (external) return validateFingerprintExternal(page);
    return validateFingerprint(page);
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
    if (ctx) {
      await ctx.close();
      runningContexts.delete(profileId);
      cdpPorts.delete(profileId);
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
