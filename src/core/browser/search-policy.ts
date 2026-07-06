import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SEARCH_URL = 'https://www.google.com/search?q={searchTerms}';
const SUGGEST_URL = 'https://www.google.com/complete/search?client=chrome&q={searchTerms}';

const MANAGED_POLICY = {
  DefaultSearchProviderEnabled: true,
  DefaultSearchProviderEnforced: true,
  DefaultSearchProviderName: 'Google',
  DefaultSearchProviderKeyword: 'google.com',
  DefaultSearchProviderSearchURL: SEARCH_URL,
  DefaultSearchProviderSuggestURL: SUGGEST_URL,
  DefaultSearchProviderIconURL: 'https://www.google.com/favicon.ico',
  SearchSuggestEnabled: true,
};

const POLICY_ENTRIES: Array<{ name: string; type: 'REG_DWORD' | 'REG_SZ'; value: string }> = [
  { name: 'DefaultSearchProviderEnabled', type: 'REG_DWORD', value: '1' },
  { name: 'DefaultSearchProviderEnforced', type: 'REG_DWORD', value: '1' },
  { name: 'DefaultSearchProviderName', type: 'REG_SZ', value: 'Google' },
  { name: 'DefaultSearchProviderKeyword', type: 'REG_SZ', value: 'google.com' },
  { name: 'DefaultSearchProviderSearchURL', type: 'REG_SZ', value: SEARCH_URL },
  { name: 'DefaultSearchProviderSuggestURL', type: 'REG_SZ', value: SUGGEST_URL },
  { name: 'DefaultSearchProviderIconURL', type: 'REG_SZ', value: 'https://www.google.com/favicon.ico' },
  { name: 'SearchSuggestEnabled', type: 'REG_DWORD', value: '1' },
];

/** Per-profile managed policy beside user-data-dir (Linux/macOS portable Chromium). */
export async function writeUserDataSearchPolicy(userDataDir: string): Promise<void> {
  const dir = path.join(userDataDir, 'policies', 'managed');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'bz_search.json'),
    JSON.stringify(MANAGED_POLICY, null, 2),
    'utf-8',
  );
}

async function regAdd(hive: string, name: string, type: string, value: string): Promise<void> {
  await execFileAsync('reg', ['add', hive, '/v', name, '/t', type, '/d', value, '/f'], {
    windowsHide: true,
  });
}

async function applyRegistryHive(hive: string): Promise<void> {
  for (const entry of POLICY_ENTRIES) {
    await regAdd(hive, entry.name, entry.type, entry.value);
  }
}

async function applyRegistryHivePowerShell(hive: string): Promise<void> {
  const psHive = hive.replace('HKCU\\', 'HKCU:\\').replace(/\\/g, '\\');
  const lines = [
    `$p = '${psHive}'`,
    'New-Item -Path $p -Force | Out-Null',
    ...POLICY_ENTRIES.map((e) => {
      const psType = e.type === 'REG_DWORD' ? 'DWord' : 'String';
      const val = e.type === 'REG_DWORD' ? e.value : e.value.replace(/'/g, "''");
      return `Set-ItemProperty -Path $p -Name '${e.name}' -Type ${psType} -Value ${e.type === 'REG_DWORD' ? e.value : `'${val}'`}`;
    }),
  ];
  await execFileAsync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', lines.join('; ')],
    { windowsHide: true },
  );
}

/**
 * Machine-wide Chromium policy via HKCU (no admin). Helps ungoogled/fingerprint-chromium
 * honor a default search provider — Preferences/Web Data alone may not bind the omnibox.
 */
export async function applySystemChromiumSearchPolicy(): Promise<void> {
  if (process.platform !== 'win32') return;

  const hives = [
    'HKCU\\Software\\Policies\\Chromium',
    'HKCU\\Software\\Policies\\Google\\Chrome',
  ];

  for (const hive of hives) {
    try {
      await applyRegistryHive(hive);
    } catch (regErr) {
      try {
        await applyRegistryHivePowerShell(hive);
      } catch (psErr) {
        if (process.env.BZ_DEBUG_SEARCH) {
          const msg = regErr instanceof Error ? regErr.message : String(regErr);
          const psMsg = psErr instanceof Error ? psErr.message : String(psErr);
          console.warn(`[search-policy] registry seed failed for ${hive}: reg=${msg}; ps=${psMsg}`);
        }
      }
    }
  }
}
