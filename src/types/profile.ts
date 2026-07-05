import { z } from 'zod';

/** Spoof mode: 1=real, 2=noise/randomize, 3=block/disable */
export const SpoofModeSchema = z.enum(['1', '2', '3']);
export type SpoofMode = z.infer<typeof SpoofModeSchema>;

export const ProxyConfigSchema = z.object({
  category: z.string().default('1'),
  type: z.string().default('CustomProxy'),
  host: z.string().default(''),
  port: z.string().default(''),
  account: z.string().optional(),
  password: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  timezone: z.string().optional(),
  ip: z.string().optional(),
  rotationMode: z.enum(['off', 'session', 'random']).default('off'),
  poolId: z.string().optional(),
});

export const FingerprintConfigSchema = z.object({
  userAgent: z.string(),
  browserVersion: z.string(),
  kernel: z.string().optional(),
  device: z.enum(['Windows', 'MacOS', 'Linux', 'iOS', 'Android']).default('Windows'),
  formFactor: z.enum(['desktop', 'mobile']).default('desktop'),
  touchPoints: z.number().optional(),
  osVersion: z.string().default('windows_10'),
  windowWidth: z.number().default(1280),
  windowHeight: z.number().default(720),
  screenLang: z.string().default('en-US'),
  systemLang: z.string().default('en-US'),
  timeZone: z.string().default('America/New_York'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  canvas: SpoofModeSchema.default('2'),
  webGlImage: SpoofModeSchema.default('2'),
  webGlMeta: SpoofModeSchema.default('2'),
  webGlMark: z.string().optional(),
  webGlMode: z.string().optional(),
  webGPU: SpoofModeSchema.default('2'),
  webGPUVendor: z.string().optional(),
  webGPUArchitecture: z.string().optional(),
  audioContext: SpoofModeSchema.default('2'),
  clientRects: SpoofModeSchema.default('2'),
  speechVoices: SpoofModeSchema.default('2'),
  mediaDevices: SpoofModeSchema.default('2'),
  webRTC: SpoofModeSchema.default('3'),
  fontEnable: SpoofModeSchema.default('2'),
  fontList: z.array(z.string()).optional(),
  mac: SpoofModeSchema.default('2'),
  macValue: z.string().optional(),
  deviceName: SpoofModeSchema.default('2'),
  deviceNameValue: z.string().optional(),
  doNotTrack: z.string().default('2'),
  sslFingerprint: SpoofModeSchema.default('2'),
  portScanProtection: SpoofModeSchema.default('1'),
  hardwareAccelerate: SpoofModeSchema.default('1'),
  hardwareConcurrency: z.number().optional(),
  deviceMemory: z.number().optional(),
  screenWidth: z.number().optional(),
  screenHeight: z.number().optional(),
  devicePixelRatio: z.number().optional(),
  tlsProfileId: z.string().optional(),
});

export const BrowserProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  remark: z.string().optional(),
  fingerprintId: z.string().uuid(),
  fingerprint: FingerprintConfigSchema,
  proxy: ProxyConfigSchema.default({}),
  tags: z.array(z.string()).default([]),
  group: z.string().optional(),
  color: z.string().optional(),
  openUrls: z.array(z.string()).default([]),
  extensions: z.array(z.string()).default([]),
  createTime: z.number(),
  lastOpened: z.number().optional(),
  lastSynced: z.number().optional(),
  syncVersion: z.number().default(1),
  isDefault: z.boolean().default(false),
  legacyId: z.string().optional(),
  deviceSignature: z.string().optional(),
  warmupPresetId: z.string().optional(),
  warmupOnLaunch: z.boolean().default(false),
  templateId: z.string().optional(),
  workspace: z.string().optional(),
  deletedAt: z.number().optional(),
  headless: z.boolean().default(false),
  minFpScore: z.number().min(0).max(100).default(0),
  enableCdp: z.boolean().default(false),
  ignoreHTTPSErrors: z.boolean().default(false),
  proxyPoolIds: z.array(z.string()).default([]),
});

export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type FingerprintConfig = z.infer<typeof FingerprintConfigSchema>;
export type BrowserProfile = z.infer<typeof BrowserProfileSchema>;

export interface ProfileManifest {
  version: 1;
  profiles: BrowserProfile[];
  trash: BrowserProfile[];
  updatedAt: number;
}

export type ConflictResolution = 'keep-local' | 'keep-remote' | 'keep-newer';

export interface SyncState {
  connected: boolean;
  lastSyncAt: number | null;
  driveFolderId: string | null;
  teamFolderId: string | null;
  useTeamFolder: boolean;
  pendingUploads: string[];
  pendingDownloads: string[];
  encryptionEnabled: boolean;
  autoSync: boolean;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  skipped: number;
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  profileId: string;
  profileName: string;
  localVersion: number;
  remoteVersion: number;
  localModified: number;
  remoteModified: number;
  localHash: string;
  remoteHash: string;
}

export interface LaunchResult {
  success: boolean;
  profileId: string;
  error?: string;
  chromiumSource?: string;
  cdpPort?: number;
  tlsReady?: boolean;
  tlsWarning?: string;
  warmupStarted?: boolean;
  fpScore?: number;
  antidetectWarnings?: string[];
}

export interface ValidationReport {
  score: number;
  passed: number;
  total: number;
  checks: { name: string; pass: boolean; detail: string }[];
  timestamp: number;
  selfReferential?: boolean;
  externalScore?: number;
  detectionScore?: number;
  minEngineScore?: number;
  sites?: { name: string; url: string; pass: boolean; detail: string; score?: number }[];
}

export interface GeoIpResult {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  languages: string[];
}
