import path from 'path';
import os from 'os';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';

const profileId = process.argv[2];
const dataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'bz-browser', 'BZBrowser');

const store = new ProfileStore(dataDir);
await store.init();
const profiles = await store.list();
const profile = profileId ? profiles.find((p) => p.id === profileId) : profiles[0];
if (!profile) {
  console.error('Profile not found');
  process.exit(1);
}

console.log('Launching:', profile.name, profile.id);
const launcher = new BrowserLauncher();
const timeout = setTimeout(() => {
  console.error('TIMEOUT after 25s');
  process.exit(2);
}, 25000);

const result = await launcher.launch(profile, dataDir);
clearTimeout(timeout);
console.log('success:', result.success);
if (result.error) {
  console.log('error (first 400 chars):', result.error.slice(0, 400));
  console.log('error length:', result.error.length);
}
if (result.success) {
  await new Promise((r) => setTimeout(r, 2000));
  await launcher.close(profile.id);
}
