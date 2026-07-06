import { contextBridge, ipcRenderer } from 'electron';
import type {
  BrowserProfile,
  LaunchResult,
  SyncState,
  SyncResult,
  ValidationReport,
  ConflictResolution,
  ProxyConfig,
} from '../src/types/profile.js';
import type {
  SavedProxy,
  ProxyHealthResult,
  ExtensionEntry,
  BulkLaunchResult,
  AutomationStatus,
  UpdateState,
} from '../src/types/phase4.js';
import type { TeamState, TeamRole } from '../src/types/team.js';
import type { RpaScript, RpaRecordingState, RpaReplayResult } from '../src/types/rpa.js';

export interface ElectronAPI {
  listProfiles: () => Promise<BrowserProfile[]>;
  getGroups: () => Promise<string[]>;
  getTags: () => Promise<string[]>;
  saveProfile: (profile: BrowserProfile) => Promise<BrowserProfile[]>;
  updateProfileMeta: (id: string, meta: { name?: string; group?: string; tags?: string[]; color?: string; remark?: string; warmupPresetId?: string; warmupOnLaunch?: boolean; workspace?: string; headless?: boolean; minFpScore?: number; rotationMode?: 'off' | 'session' | 'random'; proxyPoolIds?: string[] }) => Promise<BrowserProfile[]>;
  deleteProfile: (id: string) => Promise<BrowserProfile[]>;
  createProfile: (name: string, group?: string, options?: { formFactor?: 'desktop' | 'mobile'; device?: string }) => Promise<BrowserProfile[]>;
  previewFingerprint: (options?: {
    formFactor?: 'desktop' | 'mobile';
    device?: string;
    proxyMode?: 'none' | 'saved' | 'new';
    savedProxyId?: string;
    alignGeo?: boolean;
    proxy?: { host: string; port: string; account?: string; password?: string; type?: string; category?: string };
  }) => Promise<any>;
  createProfileFull: (payload: {
    name: string;
    count?: number;
    group?: string;
    tags?: string[];
    remark?: string;
    color?: string;
    templateId?: string;
    browserEngine?: 'chrome' | 'firefox';
    deviceOptions?: { formFactor?: 'desktop' | 'mobile'; device?: string };
    fingerprint?: Partial<Record<'canvas' | 'webGlImage' | 'webGlMeta' | 'audioContext' | 'mediaDevices' | 'webRTC' | 'fontEnable' | 'clientRects' | 'webGPU' | 'hardwareAccelerate', string>>;
    proxyMode?: 'none' | 'saved' | 'new';
    proxyId?: string;
    proxyNew?: { name: string; host: string; port: string; account?: string; password?: string; type?: string };
    alignGeo?: boolean;
    openUrls?: string[];
    extensionIds?: string[];
    headless?: boolean;
  }) => Promise<BrowserProfile[]>;
  regenerateDevice: (id: string) => Promise<{ profile?: BrowserProfile; error?: string; profiles: BrowserProfile[] }>;
  bulkLaunch: (ids: string[]) => Promise<BulkLaunchResult>;
  launchBrowser: (id: string) => Promise<LaunchResult>;
  closeBrowser: (id: string) => Promise<{ success: boolean }>;
  openProfileUrl: (id: string, url: string) => Promise<{ success: boolean; error?: string }>;
  isBrowserRunning: (id: string) => Promise<boolean>;
  validateFingerprint: (id: string, external?: boolean) => Promise<ValidationReport | null>;
  getChromiumInfo: () => Promise<{ path: string; source: string } | null>;
  getChromiumStatus: () => Promise<{ installed: boolean; path: string | null; source: string | null; isPatched: boolean; tlsReady: boolean; version: string | null; installDir: string }>;
  installPatchedChromium: () => Promise<{ success: boolean; path?: string; error?: string }>;
  runWarmup: (profileId: string, presetId: string) => Promise<{ presetId: string; success: boolean; stepsCompleted: number; totalSteps: number; cookiesSet: number; durationMs: number; error?: string } | { error: string }>;
  listWarmupPresets: () => Promise<{ id: string; name: string; description: string; category: string }[]>;
  listRpaScripts: (profileId?: string) => Promise<RpaScript[]>;
  getRpaRecordingState: () => Promise<RpaRecordingState>;
  startRpaRecording: (profileId: string) => Promise<RpaRecordingState | { error: string }>;
  stopRpaRecording: (name: string, profileId?: string) => Promise<RpaScript>;
  replayRpaScript: (profileId: string, scriptId: string) => Promise<RpaReplayResult | { error: string }>;
  deleteRpaScript: (id: string) => Promise<RpaScript[]>;
  getTeamState: () => Promise<TeamState>;
  addTeamMember: (email: string, role: TeamRole) => Promise<unknown>;
  removeTeamMember: (email: string) => Promise<TeamState>;
  updateTeamRole: (email: string, role: TeamRole) => Promise<TeamState>;
  getCdp: (id: string) => Promise<{ profileId: string; port: number; wsUrl: string | null } | null>;
  listProxies: () => Promise<SavedProxy[]>;
  saveProxy: (proxy: SavedProxy) => Promise<SavedProxy[]>;
  createProxy: (name: string, config: ProxyConfig) => Promise<SavedProxy[]>;
  deleteProxy: (id: string) => Promise<SavedProxy[]>;
  checkProxy: (id: string) => Promise<ProxyHealthResult>;
  checkProxyConfig: (proxy: { host: string; port: string; account?: string; password?: string; category?: string; type?: string }) => Promise<ProxyHealthResult>;
  checkAllProxies: () => Promise<ProxyHealthResult[]>;
  applyProxyToProfile: (profileId: string, proxyId: string) => Promise<BrowserProfile | null>;
  setInlineProxy: (profileId: string, raw: { host: string; port: string; account?: string; password?: string; type?: string } | null) => Promise<{ profile: BrowserProfile | null; health: ProxyHealthResult | null } | BrowserProfile | null>;
  listExtensions: () => Promise<ExtensionEntry[]>;
  importExtension: (path: string, name?: string) => Promise<ExtensionEntry[]>;
  installExtensionFromStore: (urlOrId: string) => Promise<{ name?: string; extensions?: ExtensionEntry[]; error?: string }>;
  importExtensionFolder: () => Promise<{ name?: string; extensions?: ExtensionEntry[]; error?: string; canceled?: boolean }>;
  importExtensionCrx: () => Promise<{ name?: string; extensions?: ExtensionEntry[]; error?: string; canceled?: boolean }>;
  removeExtension: (id: string) => Promise<ExtensionEntry[]>;
  assignExtensions: (profileId: string, extensionIds: string[]) => Promise<BrowserProfile | null>;
  getSyncStatus: () => Promise<SyncState>;
  getSyncAuthUrl: () => Promise<{ url?: string; error?: string }>;
  authenticateSync: (code: string) => Promise<SyncState>;
  setSyncPassphrase: (passphrase: string) => Promise<SyncState>;
  unlockSync: (passphrase: string) => Promise<SyncState>;
  setAutoSync: (enabled: boolean) => Promise<SyncState>;
  setTeamFolder: (folderId: string) => Promise<SyncState>;
  setUseTeamFolder: (useTeam: boolean) => Promise<SyncState>;
  runSync: (resolutions?: Record<string, ConflictResolution>) => Promise<SyncResult>;
  getAutomationStatus: () => Promise<AutomationStatus>;
  getAppPaths: () => Promise<{ dataDir: string; automationUrl: string; version: string; isPackaged: boolean; bundledChromium?: boolean }>;
  openExternal: (url: string) => Promise<void>;
  checkForUpdates: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<UpdateState>;
  installUpdate: () => Promise<UpdateState>;
  getUpdateState: () => Promise<UpdateState>;
  onUpdateStatus: (callback: (state: UpdateState) => void) => () => void;
  listTemplates: () => Promise<{ id: string; name: string; description: string; category: string }[]>;
  createFromTemplate: (templateId: string, name: string, group?: string) => Promise<BrowserProfile[]>;
  bulkCreateProfiles: (templateId: string, count: number, namePrefix: string) => Promise<BrowserProfile[]>;
  importProfilesCsv: (csv: string) => Promise<BrowserProfile[]>;
  listTrash: () => Promise<BrowserProfile[]>;
  restoreProfile: (id: string) => Promise<BrowserProfile[]>;
  purgeProfile: (id: string) => Promise<BrowserProfile[]>;
  exportCookies: (profileId: string, format: 'json' | 'netscape') => Promise<{ count: number; path?: string; canceled?: boolean }>;
  importCookies: (profileId: string, format: 'json' | 'netscape') => Promise<{ count: number; path?: string; canceled?: boolean }>;
  listApiKeys: () => Promise<{ id: string; name: string; prefix: string; createdAt: number; lastUsed?: number; permissions: string[] }[]>;
  createApiKey: (name: string) => Promise<{ entry: { id: string; name: string; prefix: string }; rawKey: string }>;
  revokeApiKey: (id: string) => Promise<{ id: string; name: string; prefix: string }[]>;
  listAuditLog: (limit?: number) => Promise<{ id: string; timestamp: number; actorEmail: string; action: string; target?: string; detail?: string }[]>;
  listResidentialProviders: () => Promise<{ id: string; name: string; hostTemplate: string; port: string; docs: string }[]>;
  createResidentialProxy: (providerId: string, name: string, account: string, password: string, country?: string) => Promise<{ proxies?: SavedProxy[]; error?: string }>;
  listExtensionMarketplace: () => Promise<{ id: string; name: string; description: string; category: string; chromeStoreId?: string }[]>;
  listWebhooks: () => Promise<{ id: string; url: string; events: string[]; enabled: boolean; createdAt: number; lastStatus?: string; lastError?: string }[]>;
  createWebhook: (url: string, events: string[], secret?: string) => Promise<{ id: string; url: string; events: string[] }>;
  deleteWebhook: (id: string) => Promise<{ id: string; url: string }[]>;
  testWebhook: (id: string) => Promise<{ success: boolean; statusCode?: number; error?: string }>;
  checkIp: (ip?: string) => Promise<unknown>;
  getAntidetectWarnings: (id: string) => Promise<string[]>;
  openFileDialog: (options: Record<string, unknown>) => Promise<unknown>;
}

const api: ElectronAPI = {
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  getGroups: () => ipcRenderer.invoke('profiles:groups'),
  getTags: () => ipcRenderer.invoke('profiles:tags'),
  saveProfile: (profile) => ipcRenderer.invoke('profiles:save', profile),
  updateProfileMeta: (id, meta) => ipcRenderer.invoke('profiles:updateMeta', id, meta),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  createProfile: (name, group, options) => ipcRenderer.invoke('profiles:create', name, group, options),
  previewFingerprint: (options) => ipcRenderer.invoke('profiles:previewFingerprint', options),
  createProfileFull: (payload) => ipcRenderer.invoke('profiles:createFull', payload),
  regenerateDevice: (id) => ipcRenderer.invoke('profiles:regenerateDevice', id),
  bulkLaunch: (ids) => ipcRenderer.invoke('profiles:bulkLaunch', ids),
  launchBrowser: (id) => ipcRenderer.invoke('browser:launch', id),
  closeBrowser: (id) => ipcRenderer.invoke('browser:close', id),
  openProfileUrl: (id, url) => ipcRenderer.invoke('browser:openUrl', id, url),
  isBrowserRunning: (id) => ipcRenderer.invoke('browser:isRunning', id),
  validateFingerprint: (id, external) => ipcRenderer.invoke('browser:validate', id, external),
  getChromiumInfo: () => ipcRenderer.invoke('browser:chromiumInfo'),
  getChromiumStatus: () => ipcRenderer.invoke('browser:chromiumStatus'),
  installPatchedChromium: () => ipcRenderer.invoke('browser:installChromium'),
  runWarmup: (profileId, presetId) => ipcRenderer.invoke('browser:runWarmup', profileId, presetId),
  listWarmupPresets: () => ipcRenderer.invoke('warmup:listPresets'),
  listRpaScripts: (profileId) => ipcRenderer.invoke('rpa:list', profileId),
  getRpaRecordingState: () => ipcRenderer.invoke('rpa:getRecordingState'),
  startRpaRecording: (profileId) => ipcRenderer.invoke('rpa:startRecording', profileId),
  stopRpaRecording: (name, profileId) => ipcRenderer.invoke('rpa:stopRecording', name, profileId),
  replayRpaScript: (profileId, scriptId) => ipcRenderer.invoke('rpa:replay', profileId, scriptId),
  deleteRpaScript: (id) => ipcRenderer.invoke('rpa:delete', id),
  getTeamState: () => ipcRenderer.invoke('team:state'),
  addTeamMember: (email, role) => ipcRenderer.invoke('team:addMember', email, role),
  removeTeamMember: (email) => ipcRenderer.invoke('team:removeMember', email),
  updateTeamRole: (email, role) => ipcRenderer.invoke('team:updateRole', email, role),
  getCdp: (id) => ipcRenderer.invoke('browser:cdp', id),
  listProxies: () => ipcRenderer.invoke('proxy:list'),
  saveProxy: (proxy) => ipcRenderer.invoke('proxy:save', proxy),
  createProxy: (name, config) => ipcRenderer.invoke('proxy:create', name, config),
  deleteProxy: (id) => ipcRenderer.invoke('proxy:delete', id),
  checkProxy: (id) => ipcRenderer.invoke('proxy:check', id),
  checkProxyConfig: (proxy) => ipcRenderer.invoke('proxy:checkConfig', proxy),
  checkAllProxies: () => ipcRenderer.invoke('proxy:checkAll'),
  applyProxyToProfile: (profileId, proxyId) => ipcRenderer.invoke('proxy:applyToProfile', profileId, proxyId),
  setInlineProxy: (profileId, raw) => ipcRenderer.invoke('profiles:setInlineProxy', profileId, raw),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  importExtension: (path, name) => ipcRenderer.invoke('extensions:import', path, name),
  installExtensionFromStore: (urlOrId) => ipcRenderer.invoke('extensions:installFromStore', urlOrId),
  importExtensionFolder: () => ipcRenderer.invoke('extensions:importFolder'),
  importExtensionCrx: () => ipcRenderer.invoke('extensions:importCrx'),
  removeExtension: (id) => ipcRenderer.invoke('extensions:remove', id),
  assignExtensions: (profileId, extensionIds) => ipcRenderer.invoke('extensions:assignToProfile', profileId, extensionIds),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  getSyncAuthUrl: () => ipcRenderer.invoke('sync:authUrl'),
  authenticateSync: (code) => ipcRenderer.invoke('sync:authenticate', code),
  setSyncPassphrase: (passphrase) => ipcRenderer.invoke('sync:setPassphrase', passphrase),
  unlockSync: (passphrase) => ipcRenderer.invoke('sync:unlock', passphrase),
  setAutoSync: (enabled) => ipcRenderer.invoke('sync:setAutoSync', enabled),
  setTeamFolder: (folderId) => ipcRenderer.invoke('sync:setTeamFolder', folderId),
  setUseTeamFolder: (useTeam) => ipcRenderer.invoke('sync:setUseTeamFolder', useTeam),
  runSync: (resolutions) => ipcRenderer.invoke('sync:run', resolutions),
  getAutomationStatus: () => ipcRenderer.invoke('automation:status'),
  getAppPaths: () => ipcRenderer.invoke('app:getPaths'),
  openExternal: (url: string) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return Promise.resolve();
    return ipcRenderer.invoke('shell:openExternal', url);
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getUpdateState: () => ipcRenderer.invoke('update:getState'),
  onUpdateStatus: (callback) => {
    const handler = (_: unknown, state: UpdateState) => callback(state);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  createFromTemplate: (templateId, name, group) => ipcRenderer.invoke('profiles:createFromTemplate', templateId, name, group),
  bulkCreateProfiles: (templateId, count, namePrefix) => ipcRenderer.invoke('profiles:bulkCreate', templateId, count, namePrefix),
  importProfilesCsv: (csv) => ipcRenderer.invoke('profiles:importCsv', csv),
  listTrash: () => ipcRenderer.invoke('profiles:listTrash'),
  restoreProfile: (id) => ipcRenderer.invoke('profiles:restore', id),
  purgeProfile: (id) => ipcRenderer.invoke('profiles:purge', id),
  exportCookies: (profileId, format) => ipcRenderer.invoke('cookies:export', profileId, format),
  importCookies: (profileId, format) => ipcRenderer.invoke('cookies:import', profileId, format),
  listApiKeys: () => ipcRenderer.invoke('apiKeys:list'),
  createApiKey: (name) => ipcRenderer.invoke('apiKeys:create', name),
  revokeApiKey: (id) => ipcRenderer.invoke('apiKeys:revoke', id),
  listAuditLog: (limit) => ipcRenderer.invoke('audit:list', limit),
  listResidentialProviders: () => ipcRenderer.invoke('residential:list'),
  createResidentialProxy: (providerId, name, account, password, country) =>
    ipcRenderer.invoke('residential:createProxy', providerId, name, account, password, country),
  listExtensionMarketplace: () => ipcRenderer.invoke('extensions:marketplace'),
  listWebhooks: () => ipcRenderer.invoke('webhooks:list'),
  createWebhook: (url, events, secret) => ipcRenderer.invoke('webhooks:create', url, events, secret),
  deleteWebhook: (id) => ipcRenderer.invoke('webhooks:delete', id),
  testWebhook: (id) => ipcRenderer.invoke('webhooks:test', id),
  checkIp: (ip) => ipcRenderer.invoke('proxy:checkIp', ip),
  getAntidetectWarnings: (id) => ipcRenderer.invoke('profiles:antidetectWarnings', id),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
};

contextBridge.exposeInMainWorld('electronAPI', api);
