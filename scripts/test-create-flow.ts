/**
 * Integration tests: profile OS mapping, search prefs seed, proxy parse.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createFromTemplate } from '../src/core/profiles/profile-templates.js';
import { createProfile } from '../src/core/fingerprint/generator.js';
import { seedProfileSearchEngine } from '../src/core/browser/prefs-seed.js';
import { resolveOsConfig, OS_TEMPLATE_MAP } from '../src/utils/os-templates.js';
import { parseProxyPaste } from '../src/utils/proxy-parse.js';
import { geoFromProxyHealth, resolvePreviewGeo } from '../src/core/fingerprint/geo.js';

function testMacTemplateCreatesMacFingerprint(): void {
  const p = createFromTemplate('mac-desktop', 'Mac Test');
  assert.equal(p.fingerprint.device, 'MacOS');
  assert.equal(p.templateId, 'mac-desktop');
  assert.ok(
    p.fingerprint.userAgent.includes('Macintosh') || p.fingerprint.userAgent.includes('Mac OS'),
    `UA should look like Mac, got: ${p.fingerprint.userAgent.slice(0, 80)}`,
  );
}

function testWindowsTemplate(): void {
  const p = createFromTemplate('win-desktop', 'Win Test');
  assert.equal(p.fingerprint.device, 'Windows');
  assert.ok(p.fingerprint.userAgent.includes('Windows'));
}

function testDeviceOptionsMac(): void {
  const p = createProfile('Direct Mac', undefined, { formFactor: 'desktop', device: 'MacOS' });
  assert.equal(p.fingerprint.device, 'MacOS');
}

function testOsTemplateMapComplete(): void {
  for (const key of ['Windows', 'MacOS', 'Linux', 'Android', 'iOS']) {
    const cfg = OS_TEMPLATE_MAP[key];
    assert.ok(cfg.templateId, `${key} missing templateId`);
    assert.ok(cfg.device, `${key} missing device`);
    const fromTpl = createFromTemplate(cfg.templateId, `Test ${key}`);
    assert.equal(fromTpl.fingerprint.device, cfg.device, `${key} template device mismatch`);
  }
}

function testResolveOsConfig(): void {
  assert.equal(resolveOsConfig('MacOS').templateId, 'mac-desktop');
  assert.equal(resolveOsConfig('bogus').templateId, 'win-desktop');
}

async function testSearchPrefsSeed(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bz-search-'));
  await seedProfileSearchEngine(tmp, { force: true });

  const prefsPath = path.join(tmp, 'Default', 'Preferences');
  const raw = await fs.readFile(prefsPath, 'utf-8');
  const prefs = JSON.parse(raw) as {
    default_search_provider_data?: { template_url_data?: { url?: string; prepopulate_id?: number } };
  };

  const url = prefs.default_search_provider_data?.template_url_data?.url ?? '';
  const prepId = prefs.default_search_provider_data?.template_url_data?.prepopulate_id;
  assert.ok(url.includes('{searchTerms}'), `search URL invalid: ${url}`);
  assert.ok(!url.includes('{google:baseURL}'), 'must not use blocked google baseURL token');
  assert.equal(prepId, 0, 'must be custom engine (prepopulate_id 0)');

  await fs.rm(tmp, { recursive: true, force: true });
}

async function testLauncherUsesBackendSearchOnly(): Promise<void> {
  const launcherSrc = await fs.readFile(
    path.join(process.cwd(), 'src/core/browser/launcher.ts'),
    'utf-8',
  );
  const injectionSrc = await fs.readFile(
    path.join(process.cwd(), 'src/core/fingerprint/injection.ts'),
    'utf-8',
  );
  assert.ok(launcherSrc.includes('ensureProfileSearchReady'), 'must ensure search before launch');
  const storeSrc = await fs.readFile(
    path.join(process.cwd(), 'src/core/storage/profile-store.ts'),
    'utf-8',
  );
  assert.ok(storeSrc.includes('seedNewProfileSearch'), 'must pre-seed search at profile creation');
  const searchSetupSrc = await fs.readFile(
    path.join(process.cwd(), 'src/core/browser/search-setup.ts'),
    'utf-8',
  );
  assert.ok(searchSetupSrc.includes('installBundledSearchExtension'), 'must bake search into profile Extensions folder');
  assert.ok(searchSetupSrc.includes('BUNDLED_SEARCH_EXTENSION_ID'), 'stable bundled search extension id');
  assert.ok(injectionSrc.includes('ExtensionManifestV3Only'), 'must allow MV2 user extensions');
}

function testProxyParse(): void {
  const hostPort = parseProxyPaste('192.168.1.1:8080');
  assert.equal(hostPort.host, '192.168.1.1');
  assert.equal(hostPort.port, '8080');

  const colonAuth = parseProxyPaste('gate.example.com:10001:myuser:mypass');
  assert.equal(colonAuth.host, 'gate.example.com');
  assert.equal(colonAuth.port, '10001');
  assert.equal(colonAuth.account, 'myuser');
  assert.equal(colonAuth.password, 'mypass');

  const atAuth = parseProxyPaste('user:secret@proxy.io:3128');
  assert.equal(atAuth.host, 'proxy.io');
  assert.equal(atAuth.port, '3128');
  assert.equal(atAuth.account, 'user');
  assert.equal(atAuth.password, 'secret');

  const socks = parseProxyPaste('socks5://u:p@host:1080');
  assert.equal(socks.type, 'SOCKS5');
  assert.equal(socks.host, 'host');
  assert.equal(socks.port, '1080');
}

function testGeoFromProxyHealth(): void {
  const geo = geoFromProxyHealth({
    id: 'inline',
    online: true,
    latencyMs: 120,
    exitIp: '8.8.8.8',
    country: 'United States',
    countryCode: 'US',
    city: 'Mountain View',
    timezone: 'America/Los_Angeles',
  });
  assert.ok(geo);
  assert.equal(geo!.timezone, 'America/Los_Angeles');
  assert.equal(geo!.languages[0], 'en-US');
}

async function testResolvePreviewGeoPending(): Promise<void> {
  const result = await resolvePreviewGeo({
    proxyMode: 'new',
    proxy: { category: '4', type: 'http', host: '127.0.0.1', port: '1' },
    alignGeo: true,
    checkProxy: async () => ({ id: 'inline', online: false, latencyMs: 0, error: 'offline' }),
  });
  assert.equal(result.pending, true);
  assert.equal(result.source, 'pending');
  assert.equal(result.geo, null);
}

async function main(): Promise<void> {
  testMacTemplateCreatesMacFingerprint();
  testWindowsTemplate();
  testDeviceOptionsMac();
  testOsTemplateMapComplete();
  testResolveOsConfig();
  testProxyParse();
  testGeoFromProxyHealth();
  await testResolvePreviewGeoPending();
  await testSearchPrefsSeed();
  await testLauncherUsesBackendSearchOnly();
  console.log('test-create-flow: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
