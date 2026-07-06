import fs from 'fs/promises';
import path from 'path';
import { resolveBrowserAsset } from './bundled-assets.js';

export const GOOGLE_KEYWORD_ID = 1000;

const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q={searchTerms}';
const TEMPLATE_WEB_DATA = resolveBrowserAsset('browser-seed', 'Web Data');

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** SQLite stores keyword URLs as plain text — no node:sqlite (unsupported in Electron). */
async function webDataContainsGoogleSearch(webDataPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(webDataPath);
    return raw.includes(Buffer.from(GOOGLE_SEARCH_URL, 'utf-8'));
  } catch {
    return false;
  }
}

/**
 * Ungoogled/fingerprint-chromium stores omnibox search engines in Web Data (SQLite).
 * We ship a pre-seeded template (built via scripts/build-webdata-template.ts).
 * Must run while Chromium is not using the profile (browser closed).
 */
export async function seedWebDataSearchEngine(profileDefaultDir: string): Promise<void> {
  if (!(await fileExists(TEMPLATE_WEB_DATA))) {
    throw new Error(`Search engine template missing at ${TEMPLATE_WEB_DATA}. Reinstall the app.`);
  }

  await fs.mkdir(profileDefaultDir, { recursive: true });
  const webDataPath = path.join(profileDefaultDir, 'Web Data');
  await fs.copyFile(TEMPLATE_WEB_DATA, webDataPath);
}

/** Throws if Web Data was not seeded — omnibox search will break without it. */
export async function verifyWebDataSeeded(profileDefaultDir: string): Promise<void> {
  const webDataPath = path.join(profileDefaultDir, 'Web Data');
  if (!(await fileExists(webDataPath))) {
    throw new Error('Web Data search database was not created. Reinstall the app.');
  }
  if (!(await webDataContainsGoogleSearch(webDataPath))) {
    throw new Error('Google search provider missing from Web Data after seed.');
  }
}

/** True when Web Data is missing or lacks the Google omnibox provider. */
export async function webDataNeedsGoogleSeed(profileDefaultDir: string): Promise<boolean> {
  const webDataPath = path.join(profileDefaultDir, 'Web Data');
  if (!(await fileExists(webDataPath))) return true;
  return !(await webDataContainsGoogleSearch(webDataPath));
}
