import { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, screen } from 'electron';

import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

import { fileURLToPath } from 'url';

import { ProfileStore } from '../src/core/storage/profile-store.js';

import { BrowserLauncher } from '../src/core/browser/launcher.js';

import { GoogleDriveSync } from '../src/core/sync/google-drive.js';

import { alignFingerprintWithGeo, applyNewDeviceToProfile, createProfile, antidetectWarnings } from '../src/core/fingerprint/generator.js';

import type { DeviceGenerateOptions } from '../src/core/fingerprint/device-generator.js';

import { lookupGeoFromIp, resolvePreviewGeo } from '../src/core/fingerprint/geo.js';

import { getChromiumStatus, setBundledResourcesPath } from '../src/core/fingerprint/chromium-resolver.js';
import { setPackagedBrowserAssetsRoot } from '../src/core/browser/bundled-assets.js';
import { applySystemChromiumSearchPolicy } from '../src/core/browser/search-policy.js';

import { installPatchedChromium } from '../src/core/fingerprint/chromium-installer.js';

import { listWarmupPresets } from '../src/core/automation/warmup-presets.js';

import { RpaStore } from '../src/core/automation/rpa-store.js';

import { TeamManager } from '../src/core/team/team-manager.js';

import { ProxyManager } from '../src/core/proxy/proxy-manager.js';

import { ExtensionLoader } from '../src/core/extensions/extension-loader.js';

import { AutomationServer, AUTOMATION_PORT } from '../src/core/api/automation-server.js';

import { ApiKeyStore } from '../src/core/api/api-key-store.js';

import { AuditLog } from '../src/core/team/audit-log.js';

import { prepareProfileForLaunch, alignProfileWithProxyIp } from '../src/core/proxy/launch-proxy.js';

import { PROFILE_TEMPLATES, bulkCreateFromTemplate, parseCsvBulkCreate, createFromTemplate } from '../src/core/profiles/profile-templates.js';

import { RESIDENTIAL_PROVIDERS, buildProviderProxy } from '../src/core/proxy/residential-providers.js';

import { listMarketplace } from '../src/core/extensions/extension-marketplace.js';

import { downloadExtensionFromStore, extractCrxFile, parseChromeExtensionId } from '../src/core/extensions/extension-installer.js';

import { WebhookStore, type WebhookEvent } from '../src/core/webhooks/webhook-store.js';

import { initAutoUpdater } from './updater.js';

import type { BrowserProfile, ConflictResolution } from '../src/types/profile.js';

import type { SavedProxy } from '../src/types/phase4.js';

import type { TeamPermission, TeamRole } from '../src/types/team.js';

import type { RpaScript } from '../src/types/rpa.js';

import { DEFAULT_STARTUP_URL } from '../src/constants/startup.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;



let mainWindow: BrowserWindow | null = null;

let profileStore: ProfileStore;

let browserLauncher: BrowserLauncher;

let driveSync: GoogleDriveSync;

let proxyManager: ProxyManager;

let extensionLoader: ExtensionLoader;

let automationServer: AutomationServer;

let rpaStore: RpaStore;

let teamManager: TeamManager;

let apiKeyStore: ApiKeyStore;

let auditLog: AuditLog;

let webhookStore: WebhookStore;



/** Dev builds use a separate folder so test runs don't mix with packaged profiles. */
const DATA_DIR = isDev
  ? path.join(app.getPath('userData'), 'BZBrowser', 'dev')
  : path.join(app.getPath('userData'), 'BZBrowser');



async function audit(action: string, target?: string, detail?: string): Promise<void> {
  if (!teamManager || !auditLog) return;
  try {
    const email = teamManager.getState().currentUserEmail ?? 'local';
    await auditLog.log(email, action, target, detail);
  } catch (err) {
    console.error('[audit] Failed:', err);
  }
}



async function fireWebhook(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  if (!webhookStore) return;
  try {
    await webhookStore.dispatch(event, data);
  } catch (err) {
    console.error('Webhook dispatch failed:', event, err);
  }
}



function getDriveConfig() {

  return {

    clientId: process.env.GOOGLE_CLIENT_ID ?? '',

    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',

    redirectUri: 'http://localhost:42813/oauth/callback',

    tokenPath: path.join(DATA_DIR, 'google-token.json'),

    settingsPath: path.join(DATA_DIR, 'sync-settings.json'),

  };

}



function requirePerm(permission: TeamPermission): void {

  teamManager.require(permission);

}



async function syncTeamUserFromDrive(): Promise<void> {

  const email = await driveSync.getUserEmail();

  if (email) await teamManager.setCurrentUser(email);

}



async function createWindow() {

  const iconPaths = [
    path.join(app.getAppPath(), 'dist', 'logo.png'),
    path.join(__dirname, '..', '..', 'public', 'logo.png'),
    path.join(process.resourcesPath ?? '', 'logo.png'),
  ];
  let icon;
  for (const p of iconPaths) {
    try {
      if (fs.existsSync(p)) {
        icon = nativeImage.createFromPath(p);
        break;
      }
    } catch { /* skip */ }
  }

  mainWindow = new BrowserWindow({

    width: 1280,

    height: 860,

    minWidth: 900,

    minHeight: 600,

    title: 'BZ Browser',

    icon,

    webPreferences: {

      preload: path.join(__dirname, 'preload.js'),

      contextIsolation: true,

      nodeIntegration: false,

    },

  });



  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('Renderer failed to load:', { code, description, url });
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('Preload script error:', preloadPath, error);
  });

  if (isDev) {

    await mainWindow.loadURL('http://localhost:5173');

    if (process.env.BZ_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

  } else {

    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));

  }

}



async function onProfileClose(profileId: string): Promise<void> {

  const profile = await profileStore.get(profileId);

  await fireWebhook('profile.closed', {

    profileId,

    profileName: profile?.name ?? profileId,

  });

  const state = await driveSync.getSyncState();

  if (!state.connected || !state.autoSync) return;

  try {

    await driveSync.syncSingleProfile(profileId, profileStore);

    await fireWebhook('sync.completed', {

      profileId,

      mode: 'auto-single',

      profileName: profile?.name,

    });

  } catch (err) {

    console.error('Auto-sync failed for', profileId, err);

  }

}



async function setupChromiumPolicies() {
  await applySystemChromiumSearchPolicy();
}

app.whenReady().then(async () => {
  await setupChromiumPolicies();

  if (app.isPackaged) {

    setBundledResourcesPath(process.resourcesPath);
    setPackagedBrowserAssetsRoot(path.join(process.resourcesPath, 'browser-assets'));

  }



  profileStore = new ProfileStore(DATA_DIR);
  console.log('[BZBrowser] data dir:', DATA_DIR);

  browserLauncher = new BrowserLauncher();

  driveSync = new GoogleDriveSync(getDriveConfig());

  proxyManager = new ProxyManager(DATA_DIR);

  extensionLoader = new ExtensionLoader(DATA_DIR);

  rpaStore = new RpaStore(DATA_DIR);

  teamManager = new TeamManager(DATA_DIR);

  apiKeyStore = new ApiKeyStore(DATA_DIR);

  auditLog = new AuditLog(DATA_DIR);

  webhookStore = new WebhookStore(DATA_DIR);

  automationServer = new AutomationServer(browserLauncher, profileStore, rpaStore, teamManager, proxyManager, apiKeyStore, driveSync, webhookStore);



  await profileStore.init();

  await driveSync.init();

  await proxyManager.init();

  await extensionLoader.init();

  await rpaStore.init();

  await teamManager.init();

  await apiKeyStore.init();

  await auditLog.init();

  await webhookStore.init();

  await syncTeamUserFromDrive();



  browserLauncher.setExtensionLoader(extensionLoader);

  browserLauncher.setOnProfileClose(onProfileClose);



  try {

    await automationServer.start(AUTOMATION_PORT);

    console.log(`Automation API: http://127.0.0.1:${AUTOMATION_PORT}`);

  } catch (err) {

    console.error('Automation API failed to start:', err);

  }



  registerIpcHandlers();

  initAutoUpdater(() => mainWindow);

  await createWindow();



  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => console.error('Failed to recreate window on activate:', err));
    }
  });

}).catch((err: Error) => {
  console.error('Fatal: app initialization failed:', err);
  dialog.showErrorBox('Startup Error', `Failed to start BZBrowser:\n${err.message}`);
  app.quit();
});



app.on('window-all-closed', () => {
  automationServer?.stop();
  // Close all running browser sessions to prevent orphaned Chromium processes
  if (browserLauncher) {
    const activeIds = browserLauncher.getActiveProfileIds?.() ?? [];
    Promise.all(activeIds.map((id: string) => browserLauncher.close(id).catch(() => {}))).then(() => {
      if (process.platform !== 'darwin') app.quit();
    }).catch(() => {
      if (process.platform !== 'darwin') app.quit();
    });
  } else {
    if (process.platform !== 'darwin') app.quit();
  }
});



function registerIpcHandlers() {

  // Profiles

  ipcMain.handle('profiles:antidetectWarnings', (_e, id: string) => {
    return profileStore.get(id).then((p) => {
      if (!p) return [];
      return antidetectWarnings(p.fingerprint, !!(p.proxy?.host && p.proxy?.port));
    });
  });

  ipcMain.handle('profiles:list', () => profileStore.list());

  ipcMain.handle('profiles:groups', () => profileStore.getGroups());

  ipcMain.handle('profiles:tags', () => profileStore.getTags());

  ipcMain.handle('profiles:save', async (_e, profile: BrowserProfile) => {

    requirePerm('profiles:edit');

    await profileStore.save(profile);

    return profileStore.list();

  });

  ipcMain.handle('profiles:updateMeta', async (_e, id: string, meta: Record<string, unknown>) => {

    requirePerm('profiles:edit');

    await profileStore.updateMeta(id, meta as Parameters<typeof profileStore.updateMeta>[1]);

    return profileStore.list();

  });

  ipcMain.handle('profiles:delete', async (_e, id: string) => {

    requirePerm('profiles:delete');

    try { await browserLauncher.close(id); } catch (e) { console.warn('[profiles:delete] close failed, proceeding:', e); }

    await profileStore.remove(id);

    return profileStore.list();

  });

  ipcMain.handle('profiles:previewFingerprint', async (_e, options?: DeviceGenerateOptions & {
    proxy?: import('../src/types/profile.js').ProxyConfig;
    proxyMode?: 'none' | 'saved' | 'new';
    savedProxyId?: string;
    alignGeo?: boolean;
  }) => {
    requirePerm('profiles:create');
    const { generateFingerprint } = await import('../src/core/fingerprint/generator.js');

    let savedProxyExitIp: string | undefined;
    if (options?.savedProxyId) {
      const saved = await proxyManager.get(options.savedProxyId);
      if (saved?.exitIp && saved.lastStatus === 'online') {
        savedProxyExitIp = saved.exitIp;
      }
    }

    const proxyMode = options?.proxyMode ?? (options?.proxy?.host && options.proxy.port ? 'new' : 'none');
    const { geo, source, pending } = await resolvePreviewGeo({
      proxyMode,
      proxy: options?.proxy,
      savedProxyExitIp,
      alignGeo: options?.alignGeo,
      checkProxy: (proxy) => proxyManager.checkProxyConfig('inline', proxy),
    });

    const previewKey = createHash('sha256').update(JSON.stringify({
      formFactor: options?.formFactor,
      device: options?.device,
      resolution: options?.resolution,
      tz: geo?.timezone,
      lang: geo?.languages?.[0],
      proxyMode,
      geoSource: source,
    })).digest('hex').slice(0, 32);
    const fp = generateFingerprint(geo ?? undefined, previewKey, options);
    return {
      ...fp,
      geoSource: source,
      geoPending: pending,
      geoCountryCode: geo?.countryCode,
      geoCountry: geo?.country,
    };
  });

  ipcMain.handle('profiles:create', async (_e, name: string, group?: string, options?: DeviceGenerateOptions) => {

    requirePerm('profiles:create');

    const geo = await lookupGeoFromIp();

    const profile = createProfile(name, geo ?? undefined, options);

    if (group) profile.group = group;

    await profileStore.save(profile);

    await fireWebhook('profile.created', { profileId: profile.id, profileName: profile.name });

    return profileStore.list();

  });

  ipcMain.handle('profiles:createFull', async (_e, payload: {
    name: string;
    count?: number;
    group?: string;
    tags?: string[];
    remark?: string;
    color?: string;
    templateId?: string;
    browserEngine?: 'chrome' | 'firefox';
    deviceOptions?: DeviceGenerateOptions;
    fingerprint?: Partial<Record<'canvas' | 'webGlImage' | 'webGlMeta' | 'audioContext' | 'mediaDevices' | 'webRTC' | 'fontEnable' | 'clientRects' | 'webGPU' | 'hardwareAccelerate', string>>;
    proxyMode?: 'none' | 'saved' | 'new';
    proxyId?: string;
    proxyNew?: { name: string; host: string; port: string; account?: string; password?: string; type?: string };
    alignGeo?: boolean;
    openUrls?: string[];
    extensionIds?: string[];
    headless?: boolean;
  }) => {
    requirePerm('profiles:create');

    // Machine geo is only a placeholder; when a proxy is set we realign to the proxy's exit geo below.
    const machineGeo = await lookupGeoFromIp();

    // Resolve the proxy config ONCE (shared across a batch) so we don't create N duplicate proxies
    // or run N identical health checks.
    let sharedProxy: BrowserProfile['proxy'] | null = null;
    if (payload.proxyMode === 'saved' && payload.proxyId) {
      const saved = await proxyManager.get(payload.proxyId);
      if (saved) sharedProxy = { ...saved.proxy };
    } else if (payload.proxyMode === 'new' && payload.proxyNew?.host && payload.proxyNew.port) {
      const proxyType = payload.proxyNew.type === 'socks5' ? 'socks5' : 'http';
      const existingProxies = await proxyManager.list();
      const duplicate = existingProxies.find((p) =>
        p.proxy.host === payload.proxyNew!.host &&
        p.proxy.port === payload.proxyNew!.port &&
        (p.proxy.account || '') === (payload.proxyNew!.account || '') &&
        (p.proxy.password || '') === (payload.proxyNew!.password || '') &&
        p.proxy.type === proxyType
      );
      if (duplicate) {
        sharedProxy = { ...duplicate.proxy };
      } else {
        const all = await proxyManager.create(payload.proxyNew.name || 'Profile proxy', {
          category: '4',
          type: proxyType,
          host: payload.proxyNew.host,
          port: payload.proxyNew.port,
          account: payload.proxyNew.account,
          password: payload.proxyNew.password,
          rotationMode: 'off',
        });
        const created = all[all.length - 1];
        if (created) sharedProxy = { ...created.proxy };
      }
    }

    // One exit-IP lookup for the whole batch.
    let proxyExitIp: string | undefined;
    if (sharedProxy?.host && sharedProxy.port) {
      const health = await proxyManager.checkProxyConfig('inline', sharedProxy);
      if (health.exitIp) proxyExitIp = health.exitIp;
    }

    const applyFpOverrides = (p: BrowserProfile) => {
      const o = payload.fingerprint;
      if (!o) return;
      const modes = ['1', '2', '3'];
      const setMode = (k: 'canvas' | 'webGlImage' | 'webGlMeta' | 'audioContext' | 'mediaDevices' | 'webRTC' | 'fontEnable' | 'clientRects' | 'webGPU' | 'hardwareAccelerate') => {
        const v = o[k];
        if (v && modes.includes(v)) (p.fingerprint as Record<string, unknown>)[k] = v;
      };
      setMode('canvas'); setMode('webGlImage'); setMode('webGlMeta'); setMode('audioContext');
      setMode('mediaDevices'); setMode('webRTC'); setMode('fontEnable'); setMode('clientRects');
      setMode('webGPU'); setMode('hardwareAccelerate');
    };

    const count = Math.max(1, Math.min(50, Math.floor(payload.count ?? 1)));
    let last: BrowserProfile | null = null;

    for (let i = 0; i < count; i++) {
      const name = count > 1 ? `${payload.name} ${i + 1}` : payload.name;
      let profile: BrowserProfile = payload.templateId
        ? createFromTemplate(payload.templateId, name, machineGeo ?? undefined)
        : createProfile(name, machineGeo ?? undefined, payload.deviceOptions);

      if (payload.group) profile.group = payload.group;
      if (payload.browserEngine) profile.browserEngine = payload.browserEngine;
      if (payload.tags?.length) profile.tags = payload.tags;
      if (payload.remark) profile.remark = payload.remark;
      if (payload.color) profile.color = payload.color;
      if (payload.headless != null) profile.headless = payload.headless;
      if (payload.openUrls?.length) profile.openUrls = payload.openUrls;
      else profile.openUrls = [DEFAULT_STARTUP_URL];
      if (payload.extensionIds?.length) profile.extensions = payload.extensionIds;
      applyFpOverrides(profile);

      if (sharedProxy) profile.proxy = { ...sharedProxy };

      if (proxyExitIp && payload.alignGeo !== false) {
        profile = await alignProfileWithProxyIp(profile, proxyExitIp);
      } else if (!sharedProxy && machineGeo) {
        profile.fingerprint = alignFingerprintWithGeo(profile.fingerprint, machineGeo);
      }

      await profileStore.save(profile);
      await fireWebhook('profile.created', { profileId: profile.id, profileName: profile.name });
      last = profile;
    }

    void last;
    return profileStore.list();
  });

  ipcMain.handle('profiles:bulkLaunch', async (_e, ids: string[]) => {

    requirePerm('profiles:launch');

    return automationServer.bulkLaunch(ids);

  });

  ipcMain.handle('profiles:regenerateDevice', async (_e, id: string) => {

    requirePerm('profiles:edit');

    const profile = await profileStore.get(id);

    if (!profile) return { error: 'Profile not found', profiles: await profileStore.list() };

    if (browserLauncher.isRunning(id)) {

      await browserLauncher.close(id);

    }

    const geo = profile.proxy.ip ? await lookupGeoFromIp(profile.proxy.ip) : await lookupGeoFromIp();

    const updated = applyNewDeviceToProfile(profile, geo ?? undefined);

    await profileStore.save(updated);

    return { profile: updated, profiles: await profileStore.list() };

  });



  // Browser

  ipcMain.handle('browser:launch', async (_e, id: string) => {

    requirePerm('profiles:launch');

    let profile = await profileStore.get(id);

    if (!profile) return { success: false, profileId: id, error: 'Profile not found' };

    const prepared = await prepareProfileForLaunch(profile, proxyManager);

    profile = prepared.profile;

    const warnings = antidetectWarnings(profile.fingerprint, !!(profile.proxy.host && profile.proxy.port));

    const display = screen.getPrimaryDisplay().workAreaSize;
    const result = await browserLauncher.launch(profile, profileStore.getDataDir(), prepared.activeProxy, {
      displaySize: { width: display.width, height: display.height },
    });

    if (result.success) {
      profile.lastOpened = Date.now();
      try {
        await profileStore.save(profile);
      } catch (err) {
        await browserLauncher.close(profile.id).catch(() => {});
        return {
          success: false,
          profileId: id,
          error: `Launch succeeded but profile state could not be saved: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      await audit('profile.launch', profile.name, result.fpScore != null ? `fpScore=${result.fpScore}` : undefined);
      await fireWebhook('profile.launched', {
        profileId: profile.id,
        profileName: profile.name,
        cdpPort: result.cdpPort,
        fpScore: result.fpScore,
      });
    }

    return { ...result, antidetectWarnings: warnings };

  });

  ipcMain.handle('browser:close', async (_e, id: string) => {
    requirePerm('profiles:launch');
    try {
      await browserLauncher.close(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('browser:openUrl', async (_e, id: string, url: string) => {

    requirePerm('profiles:launch');

    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
    } catch {
      return { success: false, error: 'Invalid URL' };
    }

    if (!browserLauncher.isRunning(id)) {

      let profile = await profileStore.get(id);

      if (!profile) return { success: false, error: 'Profile not found' };

      const prepared = await prepareProfileForLaunch(profile, proxyManager);

      profile = prepared.profile;

      const display = screen.getPrimaryDisplay().workAreaSize;
      const result = await browserLauncher.launch(profile, profileStore.getDataDir(), prepared.activeProxy, {
        displaySize: { width: display.width, height: display.height },
      });

      if (!result.success) return { success: false, error: result.error };

      profile.lastOpened = Date.now();
      await profileStore.save(profile).catch((err) => console.warn('Save lastOpened failed:', err));

    }

    const opened = await browserLauncher.openProfileUrl(id, parsed.href);

    return { success: opened, error: opened ? undefined : 'Could not open URL' };

  });

  ipcMain.handle('browser:isRunning', (_e, id: string) => browserLauncher.isRunning(id));

  ipcMain.handle('browser:validate', (_e, id: string, external?: boolean) => browserLauncher.validate(id, external));

  ipcMain.handle('browser:chromiumInfo', () => browserLauncher.getChromiumInfo());

  ipcMain.handle('browser:chromiumStatus', () => getChromiumStatus());

  ipcMain.handle('browser:installChromium', async () => installPatchedChromium());

  ipcMain.handle('browser:runWarmup', async (_e, profileId: string, presetId: string) => {

    if (!browserLauncher.isRunning(profileId)) {

      return { error: 'Launch browser first' };

    }

    return browserLauncher.runWarmup(profileId, presetId);

  });

  ipcMain.handle('warmup:listPresets', () => listWarmupPresets());

  ipcMain.handle('browser:cdp', async (_e, id: string) => {

    const wsUrl = await browserLauncher.fetchCdpWebSocketUrl(id);

    return { ...browserLauncher.getCdpEndpoint(id), wsUrl };

  });



  // RPA

  ipcMain.handle('rpa:list', (_e, profileId?: string) => rpaStore.list(profileId));

  ipcMain.handle('rpa:getRecordingState', () => browserLauncher.getRpaRecordingState());

  ipcMain.handle('rpa:startRecording', async (_e, profileId: string) => {

    requirePerm('rpa:record');

    if (!browserLauncher.isRunning(profileId)) return { error: 'Launch browser first' };

    return browserLauncher.startRpaRecording(profileId);

  });

  ipcMain.handle('rpa:stopRecording', async (_e, name: string, profileId?: string) => {

    requirePerm('rpa:record');

    const { actions, durationMs } = browserLauncher.stopRpaRecording();

    const script = await rpaStore.create(name, profileId);

    script.actions = actions;

    script.durationMs = durationMs;

    script.updatedAt = Date.now();

    return rpaStore.upsert(script);

  });

  ipcMain.handle('rpa:replay', async (_e, profileId: string, scriptId: string) => {

    requirePerm('rpa:replay');

    if (!browserLauncher.isRunning(profileId)) return { error: 'Launch browser first' };

    const script = rpaStore.get(scriptId);

    if (!script) return { error: 'Script not found' };

    return browserLauncher.replayRpa(profileId, script);

  });

  ipcMain.handle('rpa:delete', async (_e, id: string) => {

    requirePerm('rpa:record');

    await rpaStore.remove(id);

    return rpaStore.list();

  });

  ipcMain.handle('rpa:save', async (_e, script: RpaScript) => {

    requirePerm('rpa:record');

    return rpaStore.upsert({ ...script, updatedAt: Date.now() });

  });



  // Team RBAC

  ipcMain.handle('team:state', () => teamManager.getState());

  ipcMain.handle('team:addMember', async (_e, email: string, role: TeamRole) => {

    return teamManager.addMember(email, role, teamManager.getState().currentUserEmail ?? undefined);

  });

  ipcMain.handle('team:removeMember', async (_e, email: string) => {

    await teamManager.removeMember(email);

    return teamManager.getState();

  });

  ipcMain.handle('team:updateRole', async (_e, email: string, role: TeamRole) => {

    await teamManager.updateRole(email, role);

    return teamManager.getState();

  });



  // Proxy manager

  ipcMain.handle('proxy:list', () => proxyManager.list());

  ipcMain.handle('proxy:save', async (_e, proxy: SavedProxy) => {

    requirePerm('proxies:manage');

    return proxyManager.save(proxy);

  });

  ipcMain.handle('proxy:create', async (_e, name: string, config: SavedProxy['proxy']) => {

    requirePerm('proxies:manage');

    return proxyManager.create(name, config);

  });

  ipcMain.handle('proxy:delete', async (_e, id: string) => {

    requirePerm('proxies:manage');

    return proxyManager.remove(id);

  });

  ipcMain.handle('proxy:check', async (_e, id: string) => proxyManager.checkHealth(id));

  ipcMain.handle('proxy:checkConfig', async (_e, proxy: import('../src/types/profile.js').ProxyConfig) =>
    proxyManager.checkProxyConfig('inline', proxy),
  );

  ipcMain.handle('proxy:checkAll', () => proxyManager.checkAll());

  ipcMain.handle('proxy:checkIp', async (_e, ip?: string) => {
    try {
      const { checkIp } = await import('../src/core/proxy/ip-checker.js');
      return await checkIp(ip);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('proxy:applyToProfile', async (_e, profileId: string, proxyId: string) => {

    requirePerm('profiles:edit');

    const saved = await proxyManager.get(proxyId);

    if (!saved) return null;

    const health = await proxyManager.checkHealth(proxyId);

    const profile = await profileStore.assignProxy(profileId, saved.proxy);

    if (profile && health.exitIp) {

      const geo = await lookupGeoFromIp(health.exitIp);

      if (geo) {

        profile.fingerprint = alignFingerprintWithGeo(profile.fingerprint, geo);

        profile.proxy.ip = health.exitIp;

        profile.proxy.country = health.country;

        profile.proxy.city = health.city;

        profile.proxy.timezone = health.timezone;

        await profileStore.save(profile);

      }

    }

    return profile;

  });



  ipcMain.handle('profiles:setInlineProxy', async (_e, profileId: string, raw: { host: string; port: string; account?: string; password?: string; type?: string } | null) => {

    requirePerm('profiles:edit');

    if (!raw || !raw.host || !raw.port) {
      const cleared = await profileStore.assignProxy(profileId, { category: '1', type: 'noproxy', host: '', port: '', rotationMode: 'off' });
      return cleared;
    }

    const config = {
      category: '4',
      type: raw.type === 'socks5' ? 'socks5' : 'http',
      host: raw.host,
      port: raw.port,
      account: raw.account,
      password: raw.password,
      rotationMode: 'off' as const,
    };

    let profile = await profileStore.assignProxy(profileId, config);
    if (profile) {
      const health = await proxyManager.checkProxyConfig('inline', config);
      if (health.exitIp) {
        profile = (await alignProfileWithProxyIp(profile, health.exitIp));
        await profileStore.save(profile);
      }
      return { profile, health };
    }
    return { profile, health: null };

  });

  // Extensions

  ipcMain.handle('extensions:list', () => extensionLoader.list());

  ipcMain.handle('extensions:import', async (_e, sourcePath: string, name?: string) => extensionLoader.importUnpacked(sourcePath, name));

  ipcMain.handle('extensions:installFromStore', async (_e, urlOrId: string) => {
    requirePerm('profiles:edit');
    try {
      const id = parseChromeExtensionId(urlOrId);
      if (!id) return { error: 'Invalid Chrome Web Store URL or extension ID' };
      const downloaded = await downloadExtensionFromStore(id, extensionLoader.getExtensionsDir());
      const list = await extensionLoader.importUnpacked(downloaded.path, downloaded.name, id);
      const entry = list.find((e) => e.id === id);
      await audit('extension.install', entry?.name ?? id, 'chrome-store');
      return { name: entry?.name ?? downloaded.name, extensions: list };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('extensions:importFolder', async () => {
    requirePerm('profiles:edit');
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) return { error: 'No window available', canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      const list = await extensionLoader.importUnpacked(result.filePaths[0]);
      const entry = list[list.length - 1];
      return { name: entry?.name, extensions: list };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('extensions:importCrx', async () => {
    requirePerm('profiles:edit');
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) return { error: 'No window available', canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Chrome Extension', extensions: ['crx'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      const extracted = await extractCrxFile(result.filePaths[0], extensionLoader.getExtensionsDir());
      const id = path.basename(extracted.path);
      const list = await extensionLoader.importUnpacked(extracted.path, extracted.name, id);
      return { name: extracted.name, extensions: list };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('extensions:remove', async (_e, id: string) => extensionLoader.remove(id));

  ipcMain.handle('extensions:assignToProfile', async (_e, profileId: string, extensionIds: string[]) => {

    requirePerm('profiles:edit');

    const profile = await profileStore.get(profileId);

    if (!profile) return null;

    profile.extensions = extensionIds;

    await profileStore.save(profile);

    return profile;

  });



  // Sync

  ipcMain.handle('sync:status', () => driveSync.getSyncState());

  ipcMain.handle('sync:authUrl', () => {

    const config = getDriveConfig();

    if (!config.clientId) return { error: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' };

    return { url: driveSync.getAuthUrl() };

  });

  ipcMain.handle('sync:authenticate', async (_e, code: string) => {

    await driveSync.authenticate(code);

    await syncTeamUserFromDrive();

    return driveSync.getSyncState();

  });

  ipcMain.handle('sync:setPassphrase', async (_e, passphrase: string) => {

    await driveSync.savePassphrase(passphrase);

    driveSync.setPassphrase(passphrase);

    return driveSync.getSyncState();

  });

  ipcMain.handle('sync:unlock', async (_e, passphrase: string) => {

    driveSync.setPassphrase(passphrase);

    return driveSync.getSyncState();

  });

  ipcMain.handle('sync:setAutoSync', async (_e, enabled: boolean) => {

    driveSync.setAutoSync(enabled);

    return driveSync.getSyncState();

  });

  ipcMain.handle('sync:setTeamFolder', async (_e, folderId: string) => driveSync.setTeamFolder(folderId));

  ipcMain.handle('sync:setUseTeamFolder', async (_e, useTeam: boolean) => driveSync.setUseTeamFolder(useTeam));

  ipcMain.handle('sync:run', async (_e, resolutions?: Record<string, ConflictResolution>) => {

    requirePerm('sync:run');

    const manifest = await profileStore.loadManifest();

    const result = await driveSync.syncAll(manifest, profileStore, resolutions);

    await fireWebhook('sync.completed', {

      mode: 'manual-full',

      uploaded: result.uploaded,

      downloaded: result.downloaded,

      skipped: result.skipped,

      conflicts: result.conflicts.length,

    });

    return result;

  });



  // Automation API

  ipcMain.handle('automation:status', () => automationServer.getStatus());



  // App

  ipcMain.handle('app:getPaths', () => ({

    dataDir: DATA_DIR,

    automationUrl: `http://127.0.0.1:${AUTOMATION_PORT}`,

    version: app.getVersion(),

    isPackaged: app.isPackaged,

    bundledChromium: app.isPackaged,

  }));

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Blocked: only http/https URLs are allowed (got ${parsed.protocol})`);
      }
      return shell.openExternal(url);
    } catch (err) {
      console.error('[shell:openExternal] Blocked:', url, err);
      return Promise.resolve();
    }
  });



  // Templates & bulk create

  ipcMain.handle('templates:list', () => PROFILE_TEMPLATES);

  ipcMain.handle('profiles:createFromTemplate', async (_e, templateId: string, name: string, group?: string) => {

    requirePerm('profiles:create');

    const geo = await lookupGeoFromIp();

    const profile = createFromTemplate(templateId, name, geo ?? undefined);

    if (group) profile.group = group;

    await profileStore.save(profile);

    await fireWebhook('profile.created', { profileId: profile.id, profileName: profile.name });

    await audit('profile.create', profile.name, `template=${templateId}`);

    return profileStore.list();

  });

  ipcMain.handle('profiles:bulkCreate', async (_e, templateId: string, count: number, namePrefix: string) => {

    requirePerm('profiles:create');

    const safeCount = Math.max(1, Math.min(500, Math.floor(count ?? 1)));

    const geo = await lookupGeoFromIp();

    const profiles = bulkCreateFromTemplate(templateId, safeCount, namePrefix, geo ?? undefined);

    await profileStore.saveMany(profiles);

    await audit('profile.bulkCreate', namePrefix, `count=${safeCount}`);

    return profileStore.list();

  });

  ipcMain.handle('profiles:importCsv', async (_e, csv: string) => {

    requirePerm('profiles:import');

    const geo = await lookupGeoFromIp();

    const profiles = parseCsvBulkCreate(csv, geo ?? undefined);

    await profileStore.saveMany(profiles);

    await audit('profile.importCsv', undefined, `count=${profiles.length}`);

    return profileStore.list();

  });



  // Trash & workspaces

  ipcMain.handle('profiles:listTrash', () => profileStore.listTrash());

  ipcMain.handle('profiles:restore', async (_e, id: string) => {

    requirePerm('profiles:edit');

    await profileStore.restore(id);

    await audit('profile.restore', id);

    return profileStore.list();

  });

  ipcMain.handle('profiles:purge', async (_e, id: string) => {

    requirePerm('profiles:delete');

    await profileStore.purge(id);

    await audit('profile.purge', id);

    return profileStore.listTrash();

  });

  ipcMain.handle('profiles:listWorkspaces', () => profileStore.listWorkspaces());



  // Cookies

  ipcMain.handle('cookies:export', async (_e, profileId: string, format: 'json' | 'netscape') => {

    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) return { error: 'No window available', canceled: true, filePaths: [] };

    const ext = format === 'json' ? 'json' : 'txt';

    const result = await dialog.showSaveDialog(win, {

      title: 'Export cookies',

      defaultPath: `cookies-${profileId.slice(0, 8)}.${ext}`,

      filters: [{ name: format, extensions: [ext] }],

    });

    if (result.canceled || !result.filePath) return { count: 0, canceled: true };

    const count = await browserLauncher.exportCookies(profileId, format, result.filePath);

    return { count: count ?? 0, path: result.filePath };

  });

  ipcMain.handle('cookies:import', async (_e, profileId: string, format: 'json' | 'netscape') => {

    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) return { error: 'No window available', canceled: true, filePaths: [] };

    const result = await dialog.showOpenDialog(win, {

      title: 'Import cookies',

      properties: ['openFile'],

      filters: [{ name: format, extensions: format === 'json' ? ['json'] : ['txt', 'cookies'] }],

    });

    if (result.canceled || !result.filePaths[0]) return { count: 0, canceled: true };

    const count = await browserLauncher.importCookies(profileId, format, result.filePaths[0]);

    await audit('cookies.import', profileId, `count=${count ?? 0}`);

    return { count: count ?? 0, path: result.filePaths[0] };

  });



  // API keys

  ipcMain.handle('apiKeys:list', () => apiKeyStore.list());

  ipcMain.handle('apiKeys:create', async (_e, name: string) => {

    requirePerm('team:manage');

    const created = await apiKeyStore.create(name);

    await audit('apiKey.create', name);

    return created;

  });

  ipcMain.handle('apiKeys:revoke', async (_e, id: string) => {

    requirePerm('team:manage');

    await apiKeyStore.revoke(id);

    await audit('apiKey.revoke', id);

    return apiKeyStore.list();

  });



  // Audit log

  ipcMain.handle('audit:list', (_e, limit?: number) => auditLog.list(limit ?? 100));



  // Residential providers

  ipcMain.handle('residential:list', () => RESIDENTIAL_PROVIDERS);

  ipcMain.handle('residential:createProxy', async (_e, providerId: string, name: string, account: string, password: string, country?: string) => {

    requirePerm('proxies:manage');

    const proxy = buildProviderProxy(providerId, account, password, country);

    if (!proxy) return { error: 'Unknown provider' };

    const all = await proxyManager.create(name, proxy);

    await audit('proxy.residential', name, providerId);

    return { proxies: all };

  });



  // Extension marketplace

  ipcMain.handle('extensions:marketplace', () => listMarketplace());



  // File dialogs

  ipcMain.handle('dialog:openFile', async (_e, filters?: { name: string; extensions: string[] }[]) => {

    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) return { error: 'No window available', canceled: true, filePaths: [] };

    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });

    return result.canceled ? null : result.filePaths[0] ?? null;

  });



  // Webhooks

  ipcMain.handle('webhooks:list', () => webhookStore.list());

  ipcMain.handle('webhooks:create', async (_e, url: string, events: WebhookEvent[], secret?: string) => {

    requirePerm('team:manage');

    const hook = await webhookStore.create(url, events, secret);

    await audit('webhook.create', url, events.join(','));

    return hook;

  });

  ipcMain.handle('webhooks:update', async (_e, id: string, patch: { url?: string; events?: WebhookEvent[]; secret?: string; enabled?: boolean }) => {

    requirePerm('team:manage');

    return webhookStore.update(id, patch);

  });

  ipcMain.handle('webhooks:delete', async (_e, id: string) => {

    requirePerm('team:manage');

    await webhookStore.remove(id);

    await audit('webhook.delete', id);

    return webhookStore.list();

  });

  ipcMain.handle('webhooks:test', async (_e, id: string) => {

    requirePerm('team:manage');

    return webhookStore.test(id);

  });

}


