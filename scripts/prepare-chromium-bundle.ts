/**
 * Prepares patched Chromium for bundling into the NSIS installer.
 * Output: build/chromium/ (picked up by electron-builder extraResources)
 *
 * Run: npx tsx scripts/prepare-chromium-bundle.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { installPatchedChromium } from '../src/core/fingerprint/chromium-installer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIR = path.join(__dirname, '..', 'build', 'chromium');

async function copyDirContents(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirContents(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

async function main(): Promise<void> {
  console.log('Preparing patched Chromium bundle for installer...');
  console.log('Target:', BUNDLE_DIR);

  // Clean previous bundle
  await fs.promises.rm(BUNDLE_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(BUNDLE_DIR, { recursive: true });

  const result = await installPatchedChromium((msg) => console.log(' ', msg));

  if (!result.success || !result.path) {
    console.warn('\nWARNING: Could not download patched Chromium.');
    console.warn('Build will continue without bundled kernel.');
    console.warn('Users can install via Settings or place binary manually.');
    console.warn(result.error ?? '');
    // Write marker so resolver knows bundle was attempted
    await fs.promises.writeFile(
      path.join(BUNDLE_DIR, '.bundle-missing'),
      result.error ?? 'Chromium not available at build time',
    );
    process.exit(0);
  }

  const chromeDir = path.dirname(result.path);
  await copyDirContents(chromeDir, BUNDLE_DIR);

  const bundledExe = path.join(BUNDLE_DIR, path.basename(result.path));
  if (!fs.existsSync(bundledExe)) {
    await fs.promises.copyFile(result.path, bundledExe);
  }

  console.log('\nBundled Chromium ready:', bundledExe);
  if (result.version) console.log('Version:', result.version);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
