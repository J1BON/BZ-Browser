/** Chrome on Windows treats backslashes in --load-extension as escapes — use forward slashes. */
export function toChromeArgPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function joinChromeExtensionArgs(paths: string[]): string[] {
  if (paths.length === 0) return [];
  const normalized = paths.map(toChromeArgPath);
  const joined = normalized.join(',');
  return [
    '--enable-extensions',
    `--disable-extensions-except=${joined}`,
    `--load-extension=${joined}`,
  ];
}
