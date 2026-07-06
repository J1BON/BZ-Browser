import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function waitForCdp(port: number, timeoutMs = 45_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Chromium CDP port ${port} did not become ready`);
}

export interface SpawnedChromium {
  process: ChildProcess;
  port: number;
}

/** Launch fingerprint-chromium directly (no Playwright viewport lock / debugging-pipe). */
export function spawnChromiumProcess(
  executablePath: string,
  userDataDir: string,
  args: string[],
  debugPort: number,
): SpawnedChromium {
  const proc = spawn(
    executablePath,
    [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${debugPort}`, ...args],
    { stdio: 'ignore', windowsHide: false },
  );
  proc.on('error', (err) => {
    console.error('[chromium-spawn] process error:', err);
  });
  return { process: proc, port: debugPort };
}

export async function stopSpawnedProcess(proc: ChildProcess | null | undefined): Promise<void> {
  if (!proc || proc.killed) return;
  const pid = proc.pid;
  if (process.platform === 'win32' && pid) {
    try {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      return;
    } catch {
      // fall through
    }
  }
  proc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 600));
  if (!proc.killed) proc.kill('SIGKILL');
}
