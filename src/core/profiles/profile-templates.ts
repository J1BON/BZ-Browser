import type { DeviceGenerateOptions } from '../fingerprint/device-generator.js';
import { createProfile } from '../fingerprint/generator.js';
import type { BrowserProfile, GeoIpResult } from '../../types/profile.js';

export interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  category: 'desktop' | 'mobile' | 'social' | 'ads' | 'ecommerce';
  options: DeviceGenerateOptions;
  defaultGroup?: string;
  defaultTags?: string[];
  warmupPresetId?: string;
}

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  { id: 'win-desktop', name: 'Windows Desktop', description: 'Standard Windows 10/11 Chrome', category: 'desktop', options: { formFactor: 'desktop', device: 'Windows' }, defaultGroup: 'Desktop' },
  { id: 'mac-desktop', name: 'macOS Desktop', description: 'MacBook Chrome profile', category: 'desktop', options: { formFactor: 'desktop', device: 'MacOS' }, defaultGroup: 'Desktop' },
  { id: 'linux-desktop', name: 'Linux Desktop', description: 'Ubuntu/Fedora Chrome', category: 'desktop', options: { formFactor: 'desktop', device: 'Linux' }, defaultGroup: 'Desktop' },
  { id: 'iphone-17', name: 'iPhone 15 Pro', description: 'iOS Safari mobile', category: 'mobile', options: { formFactor: 'mobile', device: 'iOS' }, defaultGroup: 'Mobile', defaultTags: ['ios'] },
  { id: 'android-pixel', name: 'Android Pixel', description: 'Android Chrome mobile', category: 'mobile', options: { formFactor: 'mobile', device: 'Android' }, defaultGroup: 'Mobile', defaultTags: ['android'] },
  { id: 'fb-ads-win', name: 'Facebook Ads (Win)', description: 'Optimized for Meta ads', category: 'ads', options: { formFactor: 'desktop', device: 'Windows' }, defaultGroup: 'Facebook', defaultTags: ['facebook', 'ads'], warmupPresetId: 'social-warmup' },
  { id: 'google-ads-win', name: 'Google Ads (Win)', description: 'Optimized for Google Ads', category: 'ads', options: { formFactor: 'desktop', device: 'Windows' }, defaultGroup: 'Google', defaultTags: ['google', 'ads'], warmupPresetId: 'google-news' },
  { id: 'amazon-seller', name: 'Amazon Seller', description: 'E-commerce browsing pattern', category: 'ecommerce', options: { formFactor: 'desktop', device: 'Windows' }, defaultGroup: 'Amazon', defaultTags: ['amazon'], warmupPresetId: 'ecommerce-browse' },
  { id: 'tiktok-mobile', name: 'TikTok Mobile', description: 'Android mobile for social', category: 'social', options: { formFactor: 'mobile', device: 'Android' }, defaultGroup: 'TikTok', defaultTags: ['tiktok', 'social'], warmupPresetId: 'social-warmup' },
  { id: 'instagram-ios', name: 'Instagram iOS', description: 'iPhone for Instagram', category: 'social', options: { formFactor: 'mobile', device: 'iOS' }, defaultGroup: 'Instagram', defaultTags: ['instagram', 'social'], warmupPresetId: 'social-warmup' },
];

export function getTemplate(id: string): ProfileTemplate | undefined {
  return PROFILE_TEMPLATES.find((t) => t.id === id);
}

export function createFromTemplate(templateId: string, name: string, geo?: GeoIpResult): BrowserProfile {
  const tpl = getTemplate(templateId);
  if (!tpl) throw new Error(`Template not found: ${templateId}`);
  const profile = createProfile(name, geo, tpl.options);
  if (tpl.defaultGroup) profile.group = tpl.defaultGroup;
  if (tpl.defaultTags) profile.tags = [...tpl.defaultTags];
  if (tpl.warmupPresetId) {
    profile.warmupPresetId = tpl.warmupPresetId;
    profile.warmupOnLaunch = true;
  }
  profile.templateId = templateId;
  return profile;
}

export function bulkCreateFromTemplate(
  templateId: string,
  count: number,
  namePrefix: string,
  geo?: GeoIpResult,
): BrowserProfile[] {
  return Array.from({ length: count }, (_, i) =>
    createFromTemplate(templateId, `${namePrefix} ${i + 1}`, geo),
  );
}

export function parseCsvBulkCreate(csv: string, geo?: GeoIpResult): BrowserProfile[] {
  const lines = csv.trim().split('\n').slice(1); // skip header: name,templateId,group
  const profiles: BrowserProfile[] = [];
  for (const line of lines) {
    const [name, templateId, group] = line.split(',').map((s) => s.trim());
    if (!name) continue;
    const profile = templateId && getTemplate(templateId)
      ? createFromTemplate(templateId, name, geo)
      : createProfile(name, geo);
    if (group) profile.group = group;
    profiles.push(profile);
  }
  return profiles;
}
