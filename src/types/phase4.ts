import { z } from 'zod';
import { ProxyConfigSchema } from './profile.js';

export const SavedProxySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  proxy: ProxyConfigSchema,
  tags: z.array(z.string()).default([]),
  lastChecked: z.number().optional(),
  lastLatencyMs: z.number().optional(),
  lastStatus: z.enum(['online', 'offline', 'unknown']).default('unknown'),
  exitIp: z.string().optional(),
  country: z.string().optional(),
});

export type SavedProxy = z.infer<typeof SavedProxySchema>;

export interface ProxyHealthResult {
  id: string;
  online: boolean;
  latencyMs: number;
  exitIp?: string;
  country?: string;
  city?: string;
  timezone?: string;
  error?: string;
}

export const ExtensionEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  version: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type ExtensionEntry = z.infer<typeof ExtensionEntrySchema>;

export interface BulkLaunchResult {
  launched: string[];
  failed: { id: string; error: string }[];
}

export interface AutomationStatus {
  running: boolean;
  port: number;
  profileCount: number;
  activeBrowsers: string[];
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
}

export interface CdpEndpoint {
  profileId: string;
  wsUrl: string;
  port: number;
}
