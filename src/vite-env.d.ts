import type {

  BrowserProfile,

  LaunchResult,

  SyncState,

  SyncResult,

  ValidationReport,

  ConflictResolution,

  ProxyConfig,

} from './types/profile';

import type {

  SavedProxy,

  ProxyHealthResult,

  ExtensionEntry,

  BulkLaunchResult,

  AutomationStatus,

  UpdateState,

} from './types/phase4';

import type { TeamState, TeamRole } from './types/team';

import type { RpaScript, RpaRecordingState, RpaReplayResult } from './types/rpa';



export interface ElectronAPI {

  listProfiles: () => Promise<BrowserProfile[]>;

  getGroups: () => Promise<string[]>;

  getTags: () => Promise<string[]>;

  saveProfile: (profile: BrowserProfile) => Promise<BrowserProfile[]>;

  updateProfileMeta: (id: string, meta: { name?: string; group?: string; tags?: string[]; color?: string; remark?: string; warmupPresetId?: string; warmupOnLaunch?: boolean; workspace?: string; headless?: boolean; minFpScore?: number; rotationMode?: 'off' | 'session' | 'random'; proxyPoolIds?: string[] }) => Promise<BrowserProfile[]>;

  deleteProfile: (id: string) => Promise<BrowserProfile[]>;

  createProfile: (name: string, group?: string, options?: { formFactor?: 'desktop' | 'mobile'; device?: string }) => Promise<BrowserProfile[]>;

  regenerateDevice: (id: string) => Promise<{ profile?: BrowserProfile; error?: string; profiles: BrowserProfile[] }>;

  bulkLaunch: (ids: string[]) => Promise<BulkLaunchResult>;

  launchBrowser: (id: string) => Promise<LaunchResult>;

  closeBrowser: (id: string) => Promise<{ success: boolean }>;

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

  checkAllProxies: () => Promise<ProxyHealthResult[]>;

  applyProxyToProfile: (profileId: string, proxyId: string) => Promise<BrowserProfile | null>;

  listExtensions: () => Promise<ExtensionEntry[]>;

  importExtension: (path: string, name?: string) => Promise<ExtensionEntry[]>;

  importBroearnExtensions: () => Promise<{ count: number; extensions: ExtensionEntry[] }>;

  removeExtension: (id: string) => Promise<ExtensionEntry[]>;

  assignExtensions: (profileId: string, extensionIds: string[]) => Promise<BrowserProfile | null>;

  importBroearn: (sourceDir: string) => Promise<{ count: number; profiles: BrowserProfile[] }>;

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

  getAppPaths: () => Promise<{ dataDir: string; broearnDefault: string; automationUrl: string; version: string; isPackaged: boolean; bundledChromium?: boolean }>;

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

}



declare global {

  interface Window {

    electronAPI?: ElectronAPI;

  }

}



export {};


