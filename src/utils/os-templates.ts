/** Maps UI OS selection → profile template + fingerprint device (single source of truth). */
export const OS_TEMPLATE_MAP: Record<string, {
  templateId: string;
  device: string;
  deviceType: 'desktop' | 'mobile-ios' | 'mobile-android';
  iconId: string;
}> = {
  Windows: { templateId: 'win-desktop', device: 'Windows', deviceType: 'desktop', iconId: 'windows' },
  MacOS:   { templateId: 'mac-desktop', device: 'MacOS', deviceType: 'desktop', iconId: 'macos' },
  Linux:   { templateId: 'linux-desktop', device: 'Linux', deviceType: 'desktop', iconId: 'linux' },
  Android: { templateId: 'android-pixel', device: 'Android', deviceType: 'mobile-android', iconId: 'android' },
  iOS:     { templateId: 'iphone-17', device: 'iOS', deviceType: 'mobile-ios', iconId: 'ios' },
};

export const OS_OPTIONS = [
  { value: 'Windows', label: 'Windows' },
  { value: 'MacOS', label: 'macOS' },
  { value: 'Linux', label: 'Linux' },
  { value: 'Android', label: 'Android' },
  { value: 'iOS', label: 'iOS' },
] as const;

/** MoreLogin quick-create shows Windows, macOS, Android, iOS only */
export const OS_OPTIONS_QUICK = OS_OPTIONS.filter((o) => o.value !== 'Linux');

export function resolveOsConfig(osHint: string) {
  return OS_TEMPLATE_MAP[osHint] ?? OS_TEMPLATE_MAP.Windows;
}
