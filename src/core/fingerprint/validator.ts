import type { Page } from 'playwright-core';

export interface ValidationCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ValidationReport {
  score: number;
  passed: number;
  total: number;
  checks: ValidationCheck[];
  timestamp: number;
  /** True when this report only validates injected values (not external suites). */
  selfReferential: boolean;
}

const WORKER_CONSISTENCY_SCRIPT = `
(async () => {
  const mainUa = navigator.userAgent;
  const mainPlatform = navigator.platform;
  const workerUa = await new Promise((resolve, reject) => {
    try {
      const code = 'postMessage({ ua: navigator.userAgent, platform: navigator.platform })';
      const blob = new Blob([code], { type: 'application/javascript' });
      const w = new Worker(URL.createObjectURL(blob));
      w.onmessage = (e) => { w.terminate(); resolve(e.data); };
      w.onerror = (e) => { w.terminate(); reject(e.message); };
      setTimeout(() => { w.terminate(); reject('timeout'); }, 5000);
    } catch (e) {
      reject(String(e));
    }
  });
  return {
    uaMatch: workerUa.ua === mainUa,
    platformMatch: workerUa.platform === mainPlatform,
    workerUa: workerUa.ua,
    mainUa,
  };
})();
`;

/** Diagnostic smoke checks — not a detection score. Use external-validator for real gating. */
export async function validateFingerprint(page: Page): Promise<ValidationReport> {
  await page.goto('about:blank').catch(() => {});

  const checks: ValidationCheck[] = [
    {
      name: 'diagnostic_only',
      pass: true,
      detail: 'Local checks verify injection wiring only — run external validation for CreepJS/pixelscan scores',
    },
  ];

  return {
    score: 0,
    passed: 0,
    total: 1,
    checks,
    timestamp: Date.now(),
    selfReferential: true,
  };
}

/** Fast consistency gate: worker navigator match + native toString mask. Used at launch. */
export async function validateFingerprintQuick(page: Page): Promise<ValidationReport> {
  await page.goto('about:blank').catch(() => {});

  const checks: ValidationCheck[] = [];

  const workerResult = await page.evaluate(WORKER_CONSISTENCY_SCRIPT).catch(
    (err: Error) => ({ uaMatch: false, platformMatch: false, workerUa: '', mainUa: '', error: err.message }),
  ) as { uaMatch: boolean; platformMatch: boolean; workerUa: string; mainUa: string; error?: string };

  checks.push({
    name: 'worker_ua_match',
    pass: workerResult.uaMatch === true,
    detail: workerResult.error
      ? `worker error: ${workerResult.error}`
      : `main=${workerResult.mainUa?.slice(0, 40)} worker=${workerResult.workerUa?.slice(0, 40)}`,
  });
  checks.push({
    name: 'worker_platform_match',
    pass: workerResult.platformMatch === true,
    detail: workerResult.platformMatch ? 'ok' : 'worker platform mismatch',
  });

  const nativeMask = await page.evaluate(() => {
    try {
      return /\\[native code\\]/.test(HTMLCanvasElement.prototype.toDataURL.toString());
    } catch {
      return false;
    }
  }).catch(() => false);

  checks.push({
    name: 'fn_native_mask',
    pass: nativeMask,
    detail: nativeMask ? 'toDataURL masked' : 'toDataURL hook exposed',
  });

  const canvasStable = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      ctx.fillRect(0, 0, 64, 64);
      return c.toDataURL() === c.toDataURL();
    } catch {
      return false;
    }
  }).catch(() => false);

  checks.push({
    name: 'canvas_stable',
    pass: canvasStable,
    detail: canvasStable ? 'stable reads' : 'canvas mismatch across reads',
  });

  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;

  return {
    score: Math.round((passed / total) * 100),
    passed,
    total,
    checks,
    timestamp: Date.now(),
    selfReferential: false,
  };
}
