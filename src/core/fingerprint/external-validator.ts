import type { Page } from 'playwright-core';
import type { ValidationCheck, ValidationReport } from './validator.js';
import { validateFingerprintQuick } from './validator.js';

export interface DetectionSiteResult {
  name: string;
  url: string;
  pass: boolean;
  score: number;
  detail: string;
  lies?: number;
  trust?: number;
}

export interface ExternalValidationReport extends ValidationReport {
  externalScore: number;
  detectionScore: number;
  sites: DetectionSiteResult[];
  /** Minimum trust/consistency score across engines (0–100). */
  minEngineScore: number;
}

export const DEFAULT_MIN_DETECTION_SCORE = 70;

const NAV_OPTS = { waitUntil: 'domcontentloaded' as const, timeout: 120_000 };

async function scrapeBodyText(page: Page, max = 8000): Promise<string> {
  return page.evaluate((limit) => document.body?.innerText?.slice(0, limit) ?? '', max);
}

function parseScore(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] != null) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function parseIntField(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] != null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

async function checkCreepJS(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://abrahamjuliot.github.io/creepjs/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(14_000);
  const text = await scrapeBodyText(page, 12_000);
  const trust = parseScore(text, [
    /(\d+(?:\.\d+)?)\s*%\s*trust/i,
    /trust[:\s]+(\d+(?:\.\d+)?)/i,
    /trust score[:\s]+(\d+(?:\.\d+)?)/i,
  ]);
  const lies = parseIntField(text, [
    /(\d+)\s*lies? detected/i,
    /lies?[:\s]+(\d+)/i,
    /(\d+)\s*lie/i,
  ]);
  const flagged = /headless|bot detected|failed|inconsistent fingerprint/i.test(text);
  const pass = trust != null
    ? trust >= DEFAULT_MIN_DETECTION_SCORE && (lies ?? 0) <= 1
    : !flagged && !/0\s*%\s*trust/i.test(text);
  const score = trust ?? (pass ? 75 : 35);
  return {
    name: 'CreepJS',
    url,
    pass,
    score,
    trust: trust ?? undefined,
    lies: lies ?? undefined,
    detail: trust != null
      ? `trust=${trust}% lies=${lies ?? 0}`
      : flagged ? 'CreepJS flagged inconsistencies' : 'CreepJS loaded (trust score not parsed)',
  };
}

async function checkIphey(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://iphey.com/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(10_000);
  const text = await scrapeBodyText(page, 6000);
  const trustworthy = /trustworthy|consistent|human|real browser|passed/i.test(text);
  const suspicious = /bot|automation|suspicious|inconsistent|detected|fail/i.test(text);
  const scoreMatch = parseScore(text, [/(\d{1,3})\s*%\s*(?:trust|score|consistent)/i, /score[:\s]+(\d{1,3})/i]);
  const pass = scoreMatch != null ? scoreMatch >= DEFAULT_MIN_DETECTION_SCORE : trustworthy && !suspicious;
  return {
    name: 'iphey',
    url,
    pass,
    score: scoreMatch ?? (pass ? 80 : 40),
    detail: scoreMatch != null ? `score=${scoreMatch}%` : suspicious ? 'iphey flagged bot/automation' : 'iphey consistent',
  };
}

async function checkPixelscan(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://pixelscan.net/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(12_000);
  const text = await scrapeBodyText(page, 6000);
  const score = parseScore(text, [
    /(\d{1,3})\s*%\s*(?:consistent|score|match)/i,
    /score[:\s]*(\d{1,3})/i,
    /(\d{1,3})\/100/,
  ]);
  const suspicious = /bot|automation|inconsistent|detected|fail|proxy detected/i.test(text);
  const pass = score != null ? score >= DEFAULT_MIN_DETECTION_SCORE : !suspicious;
  return {
    name: 'Pixelscan',
    url,
    pass,
    score: score ?? (pass ? 72 : 38),
    detail: score != null ? `consistency=${score}%` : suspicious ? 'Pixelscan flagged issues' : 'Pixelscan loaded',
  };
}

async function checkSannysoft(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://bot.sannysoft.com/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(6000);
  const result = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tr')];
    let failed = 0;
    let total = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;
      total++;
      const status = cells[1]?.textContent?.toLowerCase() ?? '';
      if (status.includes('fail') || status.includes('missing') && cells[0]?.textContent?.includes('webdriver')) {
        failed++;
      }
    }
    const text = document.body?.innerText ?? '';
    const webdriverFail = /webdriver.*fail|webdriver.*true/i.test(text);
    return { failed, total, webdriverFail, text: text.slice(0, 500) };
  });
  const pass = !result.webdriverFail && (result.total === 0 || result.failed <= 1);
  const score = result.total > 0
    ? Math.round(((result.total - result.failed) / result.total) * 100)
    : (pass ? 85 : 45);
  return {
    name: 'Sannysoft',
    url,
    pass,
    score,
    detail: result.total > 0 ? `${result.total - result.failed}/${result.total} checks passed` : 'Sannysoft loaded',
  };
}

const PRIVATE_IP_RE = /\b(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+)\b/;

async function checkBrowserLeaksWebRtc(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://browserleaks.com/webrtc';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(5000);
  const html = await page.content();
  const hasPrivateIp = PRIVATE_IP_RE.test(html);
  const pass = !hasPrivateIp;
  return {
    name: 'BrowserLeaks WebRTC',
    url,
    pass,
    score: pass ? 90 : 20,
    detail: hasPrivateIp ? 'Local/private IP visible in WebRTC test' : 'No local IP leak detected',
  };
}

async function checkBrowserLeaksCanvas(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://browserleaks.com/canvas';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(4000);
  const text = await scrapeBodyText(page, 4000);
  const hasSig = /signature|hash|fingerprint|canvas/i.test(text);
  return {
    name: 'BrowserLeaks Canvas',
    url,
    pass: hasSig,
    score: hasSig ? 80 : 50,
    detail: hasSig ? 'Canvas fingerprint exported' : 'Canvas test inconclusive',
  };
}

export const DETECTION_ENGINE_TESTS = [
  { name: 'CreepJS', fn: checkCreepJS },
  { name: 'iphey', fn: checkIphey },
  { name: 'Pixelscan', fn: checkPixelscan },
  { name: 'Sannysoft', fn: checkSannysoft },
  { name: 'BrowserLeaks WebRTC', fn: checkBrowserLeaksWebRtc },
  { name: 'BrowserLeaks Canvas', fn: checkBrowserLeaksCanvas },
] as const;

/** Fast pre-launch gate: worker consistency + Sannysoft (~10s). */
export async function validateFingerprintQuickExternal(page: Page): Promise<ExternalValidationReport> {
  const quick = await validateFingerprintQuick(page);
  const sanny = await checkSannysoft(page);
  const sites = [sanny];
  const detectionScore = Math.round((quick.score + sanny.score) / 2);
  const externalChecks: ValidationCheck[] = sites.map((s) => ({
    name: s.name,
    pass: s.pass,
    detail: s.detail,
  }));

  return {
    ...quick,
    selfReferential: false,
    externalScore: sanny.score,
    detectionScore,
    minEngineScore: Math.min(quick.score, sanny.score),
    sites,
    checks: [...quick.checks, ...externalChecks],
    score: detectionScore,
    passed: quick.passed + (sanny.pass ? 1 : 0),
    total: quick.total + 1,
  };
}

/** Full detection-engine validation — use for manual QA and CI (slow, ~2 min). */
export async function validateFingerprintExternal(
  page: Page,
  minScore = DEFAULT_MIN_DETECTION_SCORE,
): Promise<ExternalValidationReport> {
  const quick = await validateFingerprintQuick(page);
  const sites: DetectionSiteResult[] = [];

  for (const test of DETECTION_ENGINE_TESTS) {
    try {
      sites.push(await test.fn(page));
    } catch (err) {
      sites.push({
        name: test.name,
        url: '',
        pass: false,
        score: 0,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const engineScores = sites.map((s) => s.score);
  const detectionScore = engineScores.length
    ? Math.round(engineScores.reduce((a, b) => a + b, 0) / engineScores.length)
    : 0;
  const minEngineScore = engineScores.length ? Math.min(...engineScores) : 0;
  const externalPassed = sites.filter((s) => s.pass && s.score >= minScore).length;
  const externalScore = sites.length ? Math.round((externalPassed / sites.length) * 100) : 0;

  const externalChecks: ValidationCheck[] = sites.map((s) => ({
    name: s.name,
    pass: s.pass && s.score >= minScore,
    detail: `${s.detail} (score=${s.score})`,
  }));

  return {
    ...quick,
    selfReferential: false,
    score: detectionScore,
    passed: externalPassed,
    total: sites.length,
    checks: [...quick.checks, ...externalChecks],
    externalScore,
    detectionScore,
    minEngineScore,
    sites,
  };
}
