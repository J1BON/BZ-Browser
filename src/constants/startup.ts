/** Default tab opened when a profile has no custom startup URLs. */
export const DEFAULT_STARTUP_URL = 'https://ip8.com';

export function resolveStartupUrls(openUrls?: string[]): string[] {
  const custom = (openUrls ?? []).map((u) => u.trim()).filter(Boolean);
  return custom.length > 0 ? custom : [DEFAULT_STARTUP_URL];
}
