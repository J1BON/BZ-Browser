import http from 'http';
import type { BrowserLauncher } from '../browser/launcher.js';
import type { ProfileStore } from '../storage/profile-store.js';
import type { RpaStore } from '../automation/rpa-store.js';
import type { TeamManager } from '../team/team-manager.js';
import type { ProxyManager } from '../proxy/proxy-manager.js';
import type { ApiKeyStore } from './api-key-store.js';
import type { GoogleDriveSync } from '../sync/google-drive.js';
import type { WebhookStore, WebhookEvent } from '../webhooks/webhook-store.js';
import type { AutomationStatus, BulkLaunchResult } from '../../types/phase4.js';
import type { BrowserProfile } from '../../types/profile.js';
import { createProfile } from '../fingerprint/generator.js';
import { prepareProfileForLaunch } from '../proxy/launch-proxy.js';
import { listWarmupPresets } from '../automation/warmup-presets.js';

const DEFAULT_PORT = 9321;

export class AutomationServer {
  private server: http.Server | null = null;
  private port = DEFAULT_PORT;
  private launcher: BrowserLauncher;
  private store: ProfileStore;
  private rpaStore: RpaStore;
  private teamManager: TeamManager;
  private proxyManager: ProxyManager;
  private apiKeys: ApiKeyStore;
  private driveSync: GoogleDriveSync;
  private webhooks: WebhookStore;

  constructor(
    launcher: BrowserLauncher,
    store: ProfileStore,
    rpaStore: RpaStore,
    teamManager: TeamManager,
    proxyManager: ProxyManager,
    apiKeys: ApiKeyStore,
    driveSync: GoogleDriveSync,
    webhooks: WebhookStore,
  ) {
    this.launcher = launcher;
    this.store = store;
    this.rpaStore = rpaStore;
    this.teamManager = teamManager;
    this.proxyManager = proxyManager;
    this.apiKeys = apiKeys;
    this.driveSync = driveSync;
    this.webhooks = webhooks;
  }

  async start(port = DEFAULT_PORT): Promise<number> {
    if (this.server) return this.port;

    this.port = port;
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(port, '127.0.0.1', () => resolve(this.port));
      this.server!.on('error', reject);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  getStatus(): AutomationStatus {
    const active = this.launcher.getActiveProfileIds();
    return {
      running: this.server !== null,
      port: this.port,
      profileCount: 0,
      activeBrowsers: active,
    };
  }

  private authRequired(): boolean {
    return true;
  }

  private checkAuth(req: http.IncomingMessage): boolean {
    if (this.apiKeys.list().length === 0) return true; // Open mode if no keys configured
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return token.length > 0 && this.apiKeys.validate(token) !== null;
  }

  private checkHost(req: http.IncomingMessage): boolean {
    const host = req.headers.host ?? '';
    if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) return false;
    const origin = req.headers.origin ?? '';
    if (origin && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('http://localhost')) {
      return false;
    }
    return true;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!this.checkHost(req)) {
      return json(res, 403, { error: 'Forbidden — API accepts loopback Host/Origin only' });
    }

    if (!this.checkAuth(req)) {
      const hasKeys = this.apiKeys.list().length > 0;
      return json(res, 401, {
        error: hasKeys
          ? 'Unauthorized — set Authorization: Bearer cab_...'
          : 'No API keys configured — create one in Settings before using the REST API',
      });
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && parts[0] === 'health') {
        return json(res, 200, { ok: true, authRequired: this.authRequired(), ...this.getStatus() });
      }

      if (req.method === 'GET' && parts[0] === 'profiles' && parts.length === 1) {
        const profiles = await this.store.list();
        return json(res, 200, { profiles });
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts.length === 1) {
        this.teamManager.require('profiles:create');
        const body = safeParseJson(await readBody(req)) as { name?: string; group?: string };
        if (!body.name) return json(res, 400, { error: 'name required' });
        const profile = createProfile(body.name);
        if (body.group) profile.group = body.group;
        await this.store.save(profile);
        await this.webhooks.dispatch('profile.created', { profileId: profile.id, profileName: profile.name });
        return json(res, 201, { profile });
      }

      if (req.method === 'PUT' && parts[0] === 'profiles' && parts.length === 2) {
        this.teamManager.require('profiles:edit');
        const existing = await this.store.get(parts[1]);
        if (!existing) return json(res, 404, { error: 'Profile not found' });
        const body = safeParseJson(await readBody(req)) as Partial<BrowserProfile>;
        const merged = { ...existing, ...body, id: existing.id, fingerprintId: existing.fingerprintId };
        await this.store.save(merged);
        return json(res, 200, { profile: merged });
      }

      if (req.method === 'DELETE' && parts[0] === 'profiles' && parts.length === 2) {
        this.teamManager.require('profiles:delete');
        await this.launcher.close(parts[1]);
        await this.store.remove(parts[1]);
        return json(res, 200, { success: true });
      }

      if (req.method === 'GET' && parts[0] === 'profiles' && parts.length === 2) {
        const profile = await this.store.get(parts[1]);
        if (!profile) return json(res, 404, { error: 'Profile not found' });
        return json(res, 200, { profile, running: this.launcher.isRunning(parts[1]) });
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts[2] === 'launch') {
        this.teamManager.require('profiles:launch');
        const profileId = parts[1];
        let profile = await this.store.get(profileId);
        if (!profile) return json(res, 404, { error: 'Profile not found' });
        const prepared = await prepareProfileForLaunch(profile, this.proxyManager);
        profile = prepared.profile;
        profile.lastOpened = Date.now();
        await this.store.save(profile);
        const rawBody = await readBody(req);
        const body = safeParseJson(rawBody) as { enableCdp?: boolean };
        const enableCdp = body.enableCdp ?? true;
        const result = await this.launcher.launch(profile, this.store.getDataDir(), prepared.activeProxy, { enableCdp });
        if (result.success) {
          await this.webhooks.dispatch('profile.launched', {
            profileId,
            profileName: profile.name,
            cdpPort: result.cdpPort,
            fpScore: result.fpScore,
          });
        }
        const cdp = this.launcher.getCdpEndpoint(profileId);
        return json(res, result.success ? 200 : 500, { ...result, cdp });
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts[2] === 'close') {
        await this.launcher.close(parts[1]);
        return json(res, 200, { success: true });
      }

      if (req.method === 'GET' && parts[0] === 'profiles' && parts[2] === 'cdp') {
        const cdp = this.launcher.getCdpEndpoint(parts[1]);
        if (!cdp) return json(res, 404, { error: 'Browser not running or CDP unavailable' });
        return json(res, 200, cdp);
      }

      if (req.method === 'GET' && parts[0] === 'profiles' && parts[2] === 'status') {
        return json(res, 200, {
          profileId: parts[1],
          running: this.launcher.isRunning(parts[1]),
          cdp: this.launcher.getCdpEndpoint(parts[1]),
        });
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts[2] === 'validate') {
        const body = await readBody(req);
        const external = (safeParseJson(body) as { external?: boolean }).external ?? false;
        const report = await this.launcher.validate(parts[1], external);
        if (!report) return json(res, 400, { error: 'Browser not running' });
        return json(res, 200, report);
      }

      if (req.method === 'GET' && parts[0] === 'proxies') {
        return json(res, 200, { proxies: await this.proxyManager.list() });
      }

      if (req.method === 'POST' && parts[0] === 'proxies') {
        this.teamManager.require('proxies:manage');
        const body = safeParseJson(await readBody(req)) as { name?: string; proxy?: BrowserProfile['proxy'] };
        if (!body.name || !body.proxy) return json(res, 400, { error: 'name and proxy required' });
        const all = await this.proxyManager.create(body.name, body.proxy);
        return json(res, 201, { proxies: all });
      }

      if (req.method === 'DELETE' && parts[0] === 'proxies' && parts.length === 2) {
        this.teamManager.require('proxies:manage');
        const all = await this.proxyManager.remove(parts[1]);
        return json(res, 200, { proxies: all });
      }

      if (req.method === 'POST' && parts[0] === 'sync' && parts[1] === 'run') {
        this.teamManager.require('sync:run');
        const state = await this.driveSync.getSyncState();
        if (!state.connected) return json(res, 400, { error: 'Drive not connected' });
        const manifest = await this.store.loadManifest();
        const result = await this.driveSync.syncAll(manifest, this.store);
        await this.webhooks.dispatch('sync.completed', {
          mode: 'api-full',
          uploaded: result.uploaded,
          downloaded: result.downloaded,
          skipped: result.skipped,
          conflicts: result.conflicts.length,
        });
        return json(res, 200, result);
      }

      if (req.method === 'GET' && parts[0] === 'warmup' && parts[1] === 'presets') {
        return json(res, 200, { presets: listWarmupPresets() });
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts[2] === 'warmup') {
        const profileId = parts[1];
        if (!this.launcher.isRunning(profileId)) {
          return json(res, 400, { error: 'Browser not running — launch profile first' });
        }
        const body = await readBody(req);
        const presetId = (safeParseJson(body) as { presetId?: string }).presetId;
        if (!presetId) return json(res, 400, { error: 'presetId required' });
        const result = await this.launcher.runWarmup(profileId, presetId);
        if (!result) return json(res, 404, { error: 'Warmup failed' });
        return json(res, result.success ? 200 : 500, result);
      }

      if (req.method === 'GET' && parts[0] === 'rpa' && parts[1] === 'scripts') {
        const profileId = url.searchParams.get('profileId') ?? undefined;
        return json(res, 200, { scripts: this.rpaStore.list(profileId) });
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts[2] === 'rpa' && parts[3] === 'record-start') {
        this.teamManager.require('rpa:record');
        const state = await this.launcher.startRpaRecording(parts[1]);
        if (!state) return json(res, 400, { error: 'Launch browser first' });
        return json(res, 200, state);
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts[2] === 'rpa' && parts[3] === 'record-stop') {
        this.teamManager.require('rpa:record');
        const body = await readBody(req);
        const { name, profileId } = safeParseJson(body) as { name?: string; profileId?: string };
        const { actions, durationMs } = this.launcher.stopRpaRecording();
        const script = await this.rpaStore.create(name ?? 'Recorded script', profileId ?? parts[1]);
        script.actions = actions;
        script.durationMs = durationMs;
        script.updatedAt = Date.now();
        await this.rpaStore.upsert(script);
        return json(res, 200, script);
      }

      if (req.method === 'POST' && parts[0] === 'profiles' && parts[2] === 'rpa' && parts[3] === 'replay') {
        this.teamManager.require('rpa:replay');
        const body = await readBody(req);
        const { scriptId } = safeParseJson(body) as { scriptId?: string };
        if (!scriptId) return json(res, 400, { error: 'scriptId required' });
        const script = this.rpaStore.get(scriptId);
        if (!script) return json(res, 404, { error: 'Script not found' });
        const result = await this.launcher.replayRpa(parts[1], script);
        if (!result) return json(res, 400, { error: 'Browser not running' });
        return json(res, result.success ? 200 : 500, result);
      }

      if (req.method === 'POST' && parts[0] === 'bulk-launch') {
        this.teamManager.require('profiles:launch');
        const body = await readBody(req);
        const ids: string[] = safeParseJson(body).profileIds ?? [];
        const result = await this.bulkLaunch(ids);
        return json(res, 200, result);
      }

      if (req.method === 'GET' && parts[0] === 'webhooks') {
        return json(res, 200, { webhooks: this.webhooks.list() });
      }

      if (req.method === 'POST' && parts[0] === 'webhooks') {
        this.teamManager.require('team:manage');
        const body = safeParseJson(await readBody(req)) as { url?: string; events?: WebhookEvent[]; secret?: string };
        if (!body.url || !body.events?.length) return json(res, 400, { error: 'url and events required' });
        const hook = await this.webhooks.create(body.url, body.events, body.secret);
        return json(res, 201, { webhook: hook });
      }

      if (req.method === 'DELETE' && parts[0] === 'webhooks' && parts.length === 2) {
        this.teamManager.require('team:manage');
        await this.webhooks.remove(parts[1]);
        return json(res, 200, { webhooks: this.webhooks.list() });
      }

      if (req.method === 'POST' && parts[0] === 'webhooks' && parts[2] === 'test') {
        this.teamManager.require('team:manage');
        const result = await this.webhooks.test(parts[1]);
        return json(res, result.success ? 200 : 502, result);
      }

      json(res, 404, { error: 'Not found', routes: [
        'GET /health',
        'GET /profiles',
        'POST /profiles',
        'PUT /profiles/:id',
        'DELETE /profiles/:id',
        'GET /profiles/:id',
        'POST /profiles/:id/launch',
        'POST /profiles/:id/close',
        'POST /profiles/:id/warmup',
        'POST /profiles/:id/validate',
        'POST /profiles/:id/rpa/record-start',
        'POST /profiles/:id/rpa/record-stop',
        'POST /profiles/:id/rpa/replay',
        'GET /profiles/:id/cdp',
        'GET /profiles/:id/status',
        'GET /proxies',
        'POST /proxies',
        'DELETE /proxies/:id',
        'POST /sync/run',
        'GET /webhooks',
        'POST /webhooks',
        'DELETE /webhooks/:id',
        'POST /webhooks/:id/test',
        'GET /warmup/presets',
        'GET /rpa/scripts',
        'POST /bulk-launch',
      ]});
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async bulkLaunch(profileIds: string[]): Promise<BulkLaunchResult> {
    const launched: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of profileIds) {
      let profile = await this.store.get(id);
      if (!profile) {
        failed.push({ id, error: 'Not found' });
        continue;
      }
      const prepared = await prepareProfileForLaunch(profile, this.proxyManager);
      profile = prepared.profile;
      profile.lastOpened = Date.now();
      await this.store.save(profile);
      const result = await this.launcher.launch(profile, this.store.getDataDir(), prepared.activeProxy);
      if (result.success) {
        await this.webhooks.dispatch('profile.launched', {
          profileId: id,
          profileName: profile.name,
          cdpPort: result.cdpPort,
          fpScore: result.fpScore,
        });
        launched.push(id);
      } else failed.push({ id, error: result.error ?? 'Launch failed' });
    }

    return { launched, failed };
  }
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function safeParseJson(str: string, fallback: any = {}): any {
  if (!str || !str.trim()) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export { DEFAULT_PORT as AUTOMATION_PORT };
