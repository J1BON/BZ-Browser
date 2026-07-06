import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let packagedAssetsRoot: string | null = null;

/** Called from Electron main when app is packaged (process.resourcesPath/browser-assets). */
export function setPackagedBrowserAssetsRoot(root: string): void {
  packagedAssetsRoot = root;
}

export function resolveBrowserAsset(...parts: string[]): string {
  const candidates = [
    packagedAssetsRoot ? path.join(packagedAssetsRoot, ...parts) : null,
    path.join(process.cwd(), 'assets', ...parts),
    path.join(fileURLToPath(new URL('../../../assets', import.meta.url)), ...parts),
  ].filter((p): p is string => !!p);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? path.join(process.cwd(), 'assets', ...parts);
}
