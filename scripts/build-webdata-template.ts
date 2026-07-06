/**
 * Build assets/browser-seed/Web Data template (run with system Node 22+ / tsx).
 */
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { ProfileStore } from '../src/core/storage/profile-store.js';
import { BrowserLauncher } from '../src/core/browser/launcher.js';
import { resolveChromium } from '../src/core/fingerprint/chromium-resolver.js';
import { GOOGLE_KEYWORD_ID } from '../src/core/browser/web-data-seed.js';

const GOOGLE_SYNC_GUID = '9d1e4b3a-2c7f-4e51-9a8b-000000001000';

function upsertGoogleKeyword(db: DatabaseSync): void {
  const now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE keywords SET is_active = 0
      WHERE url NOT LIKE 'chrome://%' AND keyword NOT LIKE '@%'
    `).run();
    db.prepare(`
      INSERT OR REPLACE INTO keywords (
        id, short_name, keyword, favicon_url, url, safe_for_autoreplace,
        originating_url, date_created, usage_count, input_encodings, suggest_url,
        prepopulate_id, created_by_policy, last_modified, sync_guid, alternate_urls,
        image_url, search_url_post_params, suggest_url_post_params, image_url_post_params,
        new_tab_url, last_visited, created_from_play_api, is_active, starter_pack_id,
        enforced_by_policy, featured_by_policy
      ) VALUES (
        ?, 'Google', 'google.com', 'https://www.google.com/favicon.ico',
        'https://www.google.com/search?q={searchTerms}', 1, '', ?, 1, '',
        'https://www.google.com/complete/search?client=chrome&q={searchTerms}',
        0, 0, ?, ?, '[]', '', '', '', '', '', 0, 0, 1, 0, 1, 0
      )
    `).run(GOOGLE_KEYWORD_ID, now, now, GOOGLE_SYNC_GUID);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

if (!resolveChromium()) {
  console.error('Install patched Chromium first');
  process.exit(1);
}

const dataDir = path.join(os.tmpdir(), `bz-wd-template-${Date.now()}`);
const store = new ProfileStore(dataDir);
await store.init();
const p = createFromTemplate('win-desktop', 'Template');
p.headless = true;
await store.save(p);

const launcher = new BrowserLauncher();
await launcher.launch(p, dataDir);
await launcher.close(p.id);

const src = path.join(dataDir, 'profiles', p.id, 'browser-data', 'Default', 'Web Data');
const outDir = path.join(process.cwd(), 'assets/browser-seed');
const out = path.join(outDir, 'Web Data');
await fs.mkdir(outDir, { recursive: true });

const db = new DatabaseSync(src);
try {
  upsertGoogleKeyword(db);
} finally {
  db.close();
}
await fs.copyFile(src, out);

const verify = new DatabaseSync(out, { readOnly: true });
const row = verify.prepare('SELECT short_name, is_active FROM keywords WHERE short_name = ?').get('Google');
verify.close();
console.log('Template Google row:', row);

await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
console.log('build-webdata-template: done');
