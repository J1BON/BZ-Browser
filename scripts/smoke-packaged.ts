import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EXE = path.join(ROOT, 'release', 'win-unpacked', 'BZ Browser.exe');
const DEBUG_PORT = 9333;
const API_PORT = 9321;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApi(timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/health`);
      if (res.status === 401 || res.status === 200) return;
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error(`Automation API did not respond on :${API_PORT}`);
}

async function waitForRenderer(timeoutMs = 20000): Promise<{ title: string; url: string; hasElectronApi: boolean; rootHtmlLen: number; hasNewUi: boolean }> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
      try {
        const page = browser.contexts()[0]?.pages()[0];
        if (!page) throw new Error('No renderer page found');
        const ui = await page.evaluate(() => ({
          hasElectronApi: !!(window as Window & { electronAPI?: unknown }).electronAPI,
          rootHtmlLen: document.getElementById('root')?.innerHTML?.length ?? 0,
          hasNewUi: !!document.querySelector('.nav-rail') && (!!document.body.textContent?.includes('New profile') || !!document.body.textContent?.includes('Start')),
        }));
        return {
          title: await page.title(),
          url: page.url(),
          ...ui,
        };
      } finally {
        await browser.close();
      }
    } catch (err) {
      lastError = err;
      await sleep(500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Renderer page did not become debuggable');
}

function kill(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    process.kill(proc.pid);
  } catch {
    // already exited
  }
}

async function main(): Promise<void> {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(EXE);
  } catch {
    throw new Error(`Missing packaged exe: ${EXE}\nRun: npm run build && npx electron-builder --win --publish never`);
  }

  const proc = spawn(EXE, [`--remote-debugging-port=${DEBUG_PORT}`], {
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    await waitForApi();
    const ui = await waitForRenderer();

    if (!ui.url.includes('/dist/index.html')) {
      throw new Error(`Unexpected renderer URL: ${ui.url}`);
    }
    if (!ui.hasElectronApi) {
      throw new Error('Preload failed: window.electronAPI is missing');
    }
    if (ui.rootHtmlLen < 50) {
      throw new Error(`React UI did not mount (root innerHTML length=${ui.rootHtmlLen})`);
    }
    if (!ui.hasNewUi) {
      throw new Error('Packaged build is stale — missing nav-rail / New Profile UI. Run npm run build before electron-builder.');
    }

    console.log('smoke-packaged: all passed');
    console.log(`  API: http://127.0.0.1:${API_PORT}/health`);
    console.log(`  UI: ${ui.title} (${ui.url})`);
    console.log(`  electronAPI: ok, rootHtmlLen=${ui.rootHtmlLen}`);
  } finally {
    kill(proc);
  }
}

main().catch((err) => {
  console.error('smoke-packaged: FAILED');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
