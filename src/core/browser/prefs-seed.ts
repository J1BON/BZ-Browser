import fs from 'fs/promises';
import path from 'path';

/**
 * fingerprint-chromium (ungoogled) ships without default search engines.
 * Without a default provider the omnibox treats queries as hostnames (e.g. "hi" → http://hi/).
 *
 * Must use a custom engine (prepopulate_id: 0) with a plain URL — prepopulated Google entries
 * get rewritten with {google:baseURL} which ungoogled blocks.
 */
interface SeedOptions {
  searchDomain?: string;
  /** When true, overwrite even if a provider entry already exists (fixes broken seeds). */
  force?: boolean;
}

const SEARCH_ID = 1000;

function customGoogleTemplate(domain: string) {
  return {
    short_name: 'Google',
    keyword: 'google.com',
    url: `https://${domain}/search?q={searchTerms}`,
    suggestions_url: `https://${domain}/complete/search?client=chrome&q={searchTerms}`,
    favicon_url: `https://${domain}/favicon.ico`,
    safe_for_autoreplace: true,
    prepopulate_id: 0,
    id: SEARCH_ID,
    is_active: 1,
    date_created: '0',
    last_modified: '0',
    last_visited: '0',
    usage_count: 1,
    synced_guid: '9d1e4b3a-2c7f-4e51-9a8b-000000001000',
    alternate_urls: [] as string[],
    new_tab_url: '',
    originating_url: '',
    created_from_play_api: false,
    input_encodings: ['UTF-8'],
  };
}

function isValidSearchProvider(prefs: Record<string, unknown>): boolean {
  const data = prefs.default_search_provider_data as { template_url_data?: { url?: string } } | undefined;
  const url = data?.template_url_data?.url ?? '';
  return typeof url === 'string' && url.includes('{searchTerms}') && !url.includes('{google:baseURL}');
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mergeSearchDefaults(prefs: Record<string, unknown>, domain: string): Record<string, unknown> {
  const p = { ...prefs };
  const tmpl = customGoogleTemplate(domain);

  p.default_search_provider_data = { template_url_data: tmpl };
  p.default_search_provider = {
    enabled: true,
    search_url: tmpl.url,
    suggest_url: tmpl.suggestions_url,
    name: tmpl.short_name,
    keyword: tmpl.keyword,
    id: String(tmpl.id),
    guid: tmpl.synced_guid,
    choice_made: true,
    prepopulate_id: 0,
  };

  // Skip EEA search-engine choice gate (otherwise omnibox treats queries as hostnames).
  p.default_search_provider_choice_screen_completion_timestamp = String(Date.now() * 1000);
  p.default_search_provider_choice_version = 1;

  const browser = { ...(p.browser as Record<string, unknown> ?? {}) };
  browser.check_default_browser = false;
  browser.has_seen_welcome_page = true;
  p.browser = browser;

  const search = { ...(p.search as Record<string, unknown> ?? {}) };
  search.suggest_enabled = true;
  p.search = search;

  const distribution = { ...(p.distribution as Record<string, unknown> ?? {}) };
  distribution.skip_first_run_ui = true;
  distribution.show_welcome_page = false;
  p.distribution = distribution;

  return p;
}

async function wipeSecurePreferences(userDataDir: string): Promise<void> {
  for (const rel of ['Default/Secure Preferences', 'Secure Preferences']) {
    await fs.rm(path.join(userDataDir, rel), { force: true }).catch(() => {});
  }
}

function preferencesPaths(userDataDir: string): string[] {
  // Playwright passes userDataDir as Chromium --user-data-dir (profile lives in Default/).
  // Also write at profile root in case the layout differs.
  return [
    path.join(userDataDir, 'Default', 'Preferences'),
    path.join(userDataDir, 'Preferences'),
  ];
}

/** Writes initial_preferences (applied on first profile init) for brand-new data dirs. */
async function writeInitialPreferences(userDataDir: string, domain: string): Promise<void> {
  const file = path.join(userDataDir, 'initial_preferences');
  try {
    await fs.access(file);
    return;
  } catch {
    // new profile — seed once
  }
  const tmpl = customGoogleTemplate(domain);
  const initial = {
    default_search_provider_data: { template_url_data: tmpl },
    default_search_provider: {
      enabled: true,
      search_url: tmpl.url,
      suggest_url: tmpl.suggestions_url,
      name: tmpl.short_name,
      keyword: tmpl.keyword,
      id: String(tmpl.id),
    },
  };
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(initial), 'utf-8');
}

/**
 * Ensures Google is the default omnibox search engine.
 * Called before every profile launch; rewrites broken or missing providers.
 */
export async function seedProfileSearchEngine(userDataDir: string, opts: SeedOptions = {}): Promise<void> {
  const domain = opts.searchDomain?.trim() || 'www.google.com';
  const force = opts.force ?? true;

  try {
    if (force) {
      await wipeSecurePreferences(userDataDir);
    }

    await writeInitialPreferences(userDataDir, domain);

    for (const file of preferencesPaths(userDataDir)) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const existing = await readJson(file);
      if (!force && isValidSearchProvider(existing)) continue;
      const merged = mergeSearchDefaults(existing, domain);
      await fs.writeFile(file, JSON.stringify(merged), 'utf-8');
    }
  } catch (err) {
    console.warn('[prefs-seed] search engine seed failed:', err);
  }
}
