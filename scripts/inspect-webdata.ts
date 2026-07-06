import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { resolveChromium } from '../src/core/fingerprint/chromium-resolver.js';

if (!resolveChromium()) process.exit(1);

const dataDir = path.join(os.tmpdir(), `bz-wd-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const p = createFromTemplate('win-desktop', 'wd');
p.headless = true;
await store.save(p);

const launcher = new BrowserLauncher();
await launcher.launch(p, dataDir);
await launcher.close(p.id);

const wd = path.join(dataDir, 'profiles', p.id, 'browser-data', 'Default', 'Web Data');
console.log('Web Data exists:', await fs.access(wd).then(() => true).catch(() => false));

const db = new DatabaseSync(wd, { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('tables:', tables.map((t: { name: string }) => t.name));

const cols = db.prepare('PRAGMA table_info(keywords)').all();
console.log('keywords columns:', cols);

const rows = db.prepare('SELECT id, short_name, keyword, url, prepopulate_id, is_active FROM keywords').all();
console.log('keywords rows:', rows);

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
