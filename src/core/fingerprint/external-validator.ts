import type { Page } from 'playwright-core';
import type { ValidationCheck, ValidationReport } from './validator.js';
import { validateFingerprint } from './validator.js';

export interface ExternalValidationReport extends ValidationReport {
  externalScore: number;
  sites: { name: string; url: string; pass: boolean; detail: string }[];
}

const PRIVATE_IP_RE = /\b(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+)\b/;

async function checkBrowserLeaksWebRtc(page: Page): Promise<{ pass: boolean; detail: string }> {
  await page.goto('https://browserleaks.com/webrtc', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const html = await page.content();
  const hasPrivateIp = PRIVATE_IP_RE.test(html);
  const blocked = html.toLowerCase().includes('n/a') || !hasPrivateIp;
  return {
    pass: blocked,
    detail: hasPrivateIp ? 'Local IP detected — WebRTC leak' : 'No local IP in WebRTC test',
  };
}

async function checkBrowserLeaksCanvas(page: Page): Promise<{ pass: boolean; detail: string }> {
  await page.goto('https://browserleaks.com/canvas', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '');
  const hasCanvasSig = /canvas|signature|hash|fingerprint/i.test(text);
  return {
    pass: hasCanvasSig,
    detail: hasCanvasSig ? 'Canvas fingerprint page loaded' : 'Could not read canvas test',
  };
}

async function checkBrowserLeaksWebgl(page: Page): Promise<{ pass: boolean; detail: string }> {
  await page.goto('https://browserleaks.com/webgl', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '');
  const hasVendor = /vendor|renderer|webgl|angle|nvidia|intel|amd|apple/i.test(text);
  return {
    pass: hasVendor,
    detail: hasVendor ? 'WebGL vendor/renderer visible' : 'WebGL test inconclusive',
  };
}

async function checkPixelscan(page: Page): Promise<{ pass: boolean; detail: string; score?: number }> {
  await page.goto('https://pixelscan.net/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(8000);
  const result = await page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    const scoreMatch = text.match(/(\d{1,3})\s*%\s*(?:consistent|score|match)/i)
      ?? text.match(/score[:\s]*(\d{1,3})/i)
      ?? text.match(/(\d{1,3})\/100/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const suspicious = /bot|automation|inconsistent|detected|fail/i.test(text);
    const consistent = /consistent|passed|good|normal/i.test(text);
    return { text: text.slice(0, 500), score, suspicious, consistent };
  });
  const pass = result.score != null ? result.score >= 70 : result.consistent && !result.suspicious;
  return {
    pass,
    score: result.score ?? undefined,
    detail: result.score != null
      ? `Pixelscan score: ${result.score}%`
      : result.suspicious
        ? 'Pixelscan flagged inconsistencies'
        : 'Pixelscan loaded — no hard fail detected',
  };
}

async function checkWhoer(page: Page): Promise<{ pass: boolean; detail: string }> {
  await page.goto('https://whoer.net/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) ?? '');
  const scoreMatch = text.match(/(\d{1,3})\s*%/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
  return {
    pass: score == null ? text.length > 200 : score >= 70,
    detail: score != null ? `Whoer anonymity: ${score}%` : 'Whoer page loaded',
  };
}

export async function validateFingerprintExternal(page: Page): Promise<ExternalValidationReport> {
  const local = await validateFingerprint(page);
  const sites: ExternalValidationReport['sites'] = [];

  const tests = [
    { name: 'BrowserLeaks WebRTC', fn: checkBrowserLeaksWebRtc },
    { name: 'BrowserLeaks Canvas', fn: checkBrowserLeaksCanvas },
    { name: 'BrowserLeaks WebGL', fn: checkBrowserLeaksWebgl },
    { name: 'Pixelscan', fn: checkPixelscan },
    { name: 'Whoer', fn: checkWhoer },
  ];

  for (const test of tests) {
    try {
      const r = await test.fn(page);
      sites.push({
        name: test.name,
        url: '',
        pass: r.pass,
        detail: r.detail,
      });
    } catch (err) {
      sites.push({
        name: test.name,
        url: '',
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const externalPassed = sites.filter((s) => s.pass).length;
  const externalScore = sites.length ? Math.round((externalPassed / sites.length) * 100) : 0;
  const combinedPassed = local.passed + externalPassed;
  const combinedTotal = local.total + sites.length;

  const externalChecks: ValidationCheck[] = sites.map((s) => ({
    name: s.name,
    pass: s.pass,
    detail: s.detail,
  }));

  return {
    ...local,
    score: Math.round((combinedPassed / combinedTotal) * 100),
    passed: combinedPassed,
    total: combinedTotal,
    checks: [...local.checks, ...externalChecks],
    externalScore,
    sites,
  };
}
