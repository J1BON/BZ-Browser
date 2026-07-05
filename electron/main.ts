import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';

import path from 'path';

import { fileURLToPath } from 'url';

import { ProfileStore } from '../src/core/storage/profile-store.js';

import { BrowserLauncher } from '../src/core/browser/launcher.js';

import { GoogleDriveSync } from '../src/core/sync/google-drive.js';

import { importBroearnProfiles } from '../src/core/import/broearn-importer.js';

import { alignFingerprintWithGeo, applyNewDeviceToProfile, createProfile, antidetectWarnings } from '../src/core/fingerprint/generator.js';

import type { DeviceGenerateOptions } from '../src/core/fingerprint/device-generator.js';

import { lookupGeoFromIp } from '../src/core/fingerprint/geo.js';

import { getChromiumStatus, setBundledResourcesPath } from '../src/core/fingerprint/chromium-resolver.js';

import { installPatchedChromium } from '../src/core/fingerprint/chromium-installer.js';

import { listWarmupPresets } from '../src/core/automation/warmup-presets.js';

import { RpaStore } from '../src/core/automation/rpa-store.js';

import { TeamManager } from '../src/core/team/team-manager.js';

import { ProxyManager } from '../src/core/proxy/proxy-manager.js';

import { ExtensionLoader } from '../src/core/extensions/extension-loader.js';

import { AutomationServer, AUTOMATION_PORT } from '../src/core/api/automation-server.js';

import { ApiKeyStore } from '../src/core/api/api-key-store.js';

import { AuditLog } from '../src/core/team/audit-log.js';

import { prepareProfileForLaunch } from '../src/core/proxy/launch-proxy.js';

import { PROFILE_TEMPLATES, bulkCreateFromTemplate, parseCsvBulkCreate, createFromTemplate } from '../src/core/profiles/profile-templates.js';

import { RESIDENTIAL_PROVIDERS, buildProviderProxy } from '../src/core/proxy/residential-providers.js';

import { listMarketplace } from '../src/core/extensions/extension-marketplace.js';

import { WebhookStore, type WebhookEvent } from '../src/core/webhooks/webhook-store.js';

import { initAutoUpdater } from './updater.js';

import type { BrowserProfile, ConflictResolution } from '../src/types/profile.js';

import type { SavedProxy } from '../src/types/phase4.js';

import type { TeamPermission, TeamRole } from '../src/types/team.js';

import type { RpaScript } from '../src/types/rpa.js';



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



const DATA_DIR = path.join(app.getPath('userData'), 'CloudAntidetect');



async function audit(action: string, target?: string, detail?: string): Promise<void> {

  const email = teamManager.getState().currentUserEmail ?? 'local';

  await auditLog.log(email, action, target, detail);

}



async function fireWebhook(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {

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

  mainWindow = new BrowserWindow({

    width: 1280,

    height: 860,

    minWidth: 900,

    minHeight: 600,

    title: 'Cloud Antidetect Browser',

    webPreferences: {

      preload: path.join(__dirname, 'preload.js'),

      contextIsolation: true,

      nodeIntegration: false,

    },

  });



  if (isDev) {

    await mainWindow.loadURL('http://localhost:5173');

    mainWindow.webContents.openDevTools({ mode: 'detach' });

  } else {

    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

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



app.whenReady().then(async () => {

  if (app.isPackaged) {

    setBundledResourcesPath(process.resourcesPath);

  }



  profileStore = new ProfileStore(DATA_DIR);

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

    if (BrowserWindow.getAllWindows().length === 0) createWindow();

  });

});



app.on('window-all-closed', () => {

  automationServer?.stop();

  if (process.platform !== 'darwin') app.quit();

});



function registerIpcHandlers() {

  // Profiles

  ipcMain.handle('profiles:antidetectWarnings', (_e, id: string) => {
    return profileStore.get(id).then((p) => {
      if (!p) return [];
      return antidetectWarnings(p.fingerprint, !!(p.proxy.host && p.proxy.port));
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

    await browserLauncher.close(id);

    await profileStore.remove(id);

    return profileStore.list();

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

    profile.lastOpened = Date.now();

    await profileStore.save(profile);

    const warnings = antidetectWarnings(profile.fingerprint, !!(profile.proxy.host && profile.proxy.port));

    const result = await browserLauncher.launch(profile, profileStore.getDataDir(), prepared.activeProxy);

    if (result.success) {
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

    await browserLauncher.close(id);

    return { success: true };

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

  ipcMain.handle('proxy:checkAll', () => proxyManager.checkAll());

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



  // Extensions

  ipcMain.handle('extensions:list', () => extensionLoader.list());

  ipcMain.handle('extensions:import', async (_e, sourcePath: string, name?: string) => extensionLoader.importUnpacked(sourcePath, name));

  ipcMain.handle('extensions:importBroearn', async () => {

    const broearnExt = path.join(process.env.LOCALAPPDATA ?? '', 'BroearnBrowser', 'ExtensionUnpacked');

    const count = await extensionLoader.importFromBroearn(broearnExt);

    return { count, extensions: await extensionLoader.list() };

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



  // Import

  ipcMain.handle('import:broearn', async (_e, sourceDir: string) => {

    requirePerm('profiles:import');

    const imported = await importBroearnProfiles(sourceDir);

    for (const p of imported) await profileStore.save(p);

    return { count: imported.length, profiles: await profileStore.list() };

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

    broearnDefault: path.join(process.env.LOCALAPPDATA ?? '', 'BroearnBrowser'),

    automationUrl: `http://127.0.0.1:${AUTOMATION_PORT}`,

    version: app.getVersion(),

    isPackaged: app.isPackaged,

    bundledChromium: app.isPackaged,

  }));

  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url));



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

    const geo = await lookupGeoFromIp();

    const profiles = bulkCreateFromTemplate(templateId, count, namePrefix, geo ?? undefined);

    await profileStore.saveMany(profiles);

    await audit('profile.bulkCreate', namePrefix, `count=${count}`);

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

    const ext = format === 'json' ? 'json' : 'txt';

    const result = await dialog.showSaveDialog(win!, {

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

    const result = await dialog.showOpenDialog(win!, {

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

    const result = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters });

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


