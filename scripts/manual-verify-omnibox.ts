/**
 * Manual omnibox verification — run headed, then type in the address bar yourself.
 * Watches navigation events and prints the final URL.
 *
 * Usage: npx tsx scripts/manual-verify-omnibox.ts
 */
import path from 'node:path';
import os from 'node:os';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { resolveChromium } from '../src/core/fingerprint/chromium-resolver.js';

if (!resolveChromium()) {
  console.error('Install patched Chromium first.');
  process.exit(1);
}

const dataDir = path.join(os.tmpdir(), `bz-manual-omnibox-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const profile = createFromTemplate('win-desktop', 'ManualOmnibox');
profile.headless = false;
await store.save(profile);

const launcher = new BrowserLauncher();
const result = await launcher.launch(profile, dataDir, undefined, {
  displaySize: { width: 1920, height: 1080 },
});
if (!result.success) {
  console.error('Launch failed:', result.error);
  process.exit(1);
}

const ctx = launcher.getContext(profile.id)!;
for (const page of ctx.pages()) {
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log(`[nav] ${frame.url()}`);
    }
  });
}

const tab = await ctx.newPage();
await tab.goto('chrome://newtab').catch(() => {});

console.log('\n--- Manual steps ---');
console.log('1. Click the profile browser window (not this terminal).');
console.log('2. Press Ctrl+L to focus the address bar.');
console.log('3. Type: hello');
console.log('4. Press Enter.');
console.log('Expected: https://www.google.com/search?q=hello');
console.log('Failure:  http://hello/ or a non-Google page');
console.log('\nWatching navigations for 90s… (Ctrl+C to stop early)\n');

await new Promise((r) => setTimeout(r, 90_000));
await launcher.close(profile.id);
