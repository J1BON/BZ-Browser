/**
 * Static UI parity checks vs MoreLogin create flow + light theme.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OS_OPTIONS_QUICK } from '../src/utils/os-templates.js';

async function read(rel: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), rel), 'utf-8');
}

async function main(): Promise<void> {
  const createView = await read('src/components/CreateProfileView.tsx');
  const styles = await read('src/styles.css');
  const appTsx = await read('src/App.tsx');
  const osTemplates = await read('src/utils/os-templates.ts');

  // MoreLogin create shell
  assert.ok(createView.includes('create-page-ml'), 'create page must use MoreLogin scope');
  assert.ok(createView.includes('Quick create'), 'Quick create tab label');
  assert.ok(createView.includes('Advanced create'), 'Advanced create tab label');
  assert.ok(createView.includes('Browser profile overview'), 'right overview panel title');
  assert.ok(createView.includes('overview-panel-ml'), 'overview panel class');
  assert.ok(createView.includes('engine-card-ml'), 'Chrome/Firefox engine cards');
  assert.ok(createView.includes('os-grid-ml'), 'OS picker grid');
  assert.ok(createView.includes('OS_OPTIONS_QUICK'), 'quick create uses 4 OS like MoreLogin');
  assert.ok(createView.includes('End-to-end encryption'), 'E2E encryption toggle');
  assert.ok(createView.includes('Canvas fingerprint technology'), 'canvas innovation toggle');
  assert.ok(createView.includes('Network detection'), 'proxy detection button label');
  assert.ok(createView.includes('Confirm'), 'confirm footer button');

  // No dark-theme leaks in create view
  assert.ok(!createView.includes('rgba(0,0,0,0.06)'), 'advanced sidebar must not use dark inline bg');
  assert.ok(!createView.includes('2px solid white'), 'color picker must not use white ring on light bg');
  assert.ok(createView.includes('spoof-toggle-ml'), 'fingerprint toggles use light ML styles');

  // Light theme tokens (MoreLogin blue)
  assert.ok(styles.includes('--accent:         #4e73f8'), 'global accent must match MoreLogin blue');
  assert.ok(styles.includes('color-scheme: light'), 'app uses light color scheme');
  assert.ok(styles.includes('--ml-bg: #f0f2f5'), 'create page light background');
  assert.ok(styles.includes('.create-page-ml .split-creation-sidebar'), 'advanced sidebar scoped to light ML');

  // OS quick options
  assert.ok(osTemplates.includes('OS_OPTIONS_QUICK'), 'quick OS filter exported');
  for (const os of ['Windows', 'MacOS', 'Android', 'iOS']) {
    assert.ok(osTemplates.includes(`value: '${os}'`), `${os} in OS options`);
  }
  assert.equal(OS_OPTIONS_QUICK.length, 4, 'quick create has 4 OS options');
  assert.ok(!OS_OPTIONS_QUICK.some((o) => o.value === 'Linux'), 'Linux only in advanced create');

  assert.ok(appTsx.includes('nav-new-profile'), 'sidebar + New profile button like MoreLogin');
  for (const tab of ['General', 'Proxy Setup', 'Fingerprint', 'Advanced']) {
    assert.ok(createView.includes(tab), `advanced tab: ${tab}`);
  }

  console.log('test-ui-morelogin: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
