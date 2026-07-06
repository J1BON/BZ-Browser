import path from 'path';
import os from 'os';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { resolveChromium } from '../src/core/fingerprint/chromium-resolver.js';

if (!resolveChromium()) process.exit(1);

const dataDir = path.join(os.tmpdir(), `bz-chrome-settings-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const p = createFromTemplate('win-desktop', 's');
p.headless = false;
await store.save(p);

const launcher = new BrowserLauncher();
await launcher.launch(p, dataDir);
const page = launcher.getContext(p.id)!.pages()[0];
await page.goto('chrome://settings/searchEngines');
await page.waitForTimeout(2000);
const text = await page.innerText('body').catch(() => '');
console.log(text.slice(0, 1500));
await launcher.close(p.id);
