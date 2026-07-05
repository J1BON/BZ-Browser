import type { Page } from 'playwright-core';
import type { ValidationCheck, ValidationReport } from './validator.js';
import { validateFingerprintQuick } from './validator.js';

export interface DetectionSiteResult {
  name: string;
  url: string;
  pass: boolean;
  score: number | null;
  detail: string;
  lies?: number;
  trust?: number;
  parsed: boolean;
}

export interface ExternalValidationReport extends ValidationReport {
  externalScore: number;
  detectionScore: number;
  sites: DetectionSiteResult[];
  minEngineScore: number;
}

export const DEFAULT_MIN_DETECTION_SCORE = 70;

const NAV_OPTS = { waitUntil: 'domcontentloaded' as const, timeout: 120_000 };

function siteResult(
  name: string,
  url: string,
  pass: boolean,
  score: number | null,
  detail: string,
  parsed: boolean,
  extra?: { lies?: number; trust?: number },
): DetectionSiteResult {
  return { name, url, pass, score, detail, parsed, ...extra };
}

async function checkCreepJS(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://abrahamjuliot.github.io/creepjs/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(16_000);

  const data = await page.evaluate(() => {
    const out: { trust: number | null; lies: number | null; text: string } = {
      trust: null,
      lies: null,
      text: '',
    };
    try {
      const w = window as unknown as Record<string, unknown>;
      if (w.Creep && typeof w.Creep === 'object') {
        const creep = w.Creep as Record<string, unknown>;
        if (typeof creep.trustScore === 'number') out.trust = creep.trustScore;
        if (typeof creep.lies === 'number') out.lies = creep.lies;
      }
      const scoreEl = document.querySelector('.trust-score, [data-trust], .score-value');
      if (scoreEl?.textContent) {
        const m = scoreEl.textContent.match(/(\d+(?:\.\d+)?)/);
        if (m) out.trust = parseFloat(m[1]);
      }
      const liesEl = document.querySelector('.lies, [data-lies]');
      if (liesEl?.textContent) {
        const m = liesEl.textContent.match(/(\d+)/);
        if (m) out.lies = parseInt(m[1], 10);
      }
      out.text = document.body?.innerText?.slice(0, 2000) ?? '';
    } catch {
      /* ignore */
    }
    return out;
  });

  const parsed = data.trust != null;
  const pass = parsed
    ? data.trust! >= DEFAULT_MIN_DETECTION_SCORE && (data.lies ?? 0) <= 1
    : false;

  return siteResult(
    'CreepJS',
    url,
    pass,
    parsed ? data.trust : null,
    parsed
      ? `trust=${data.trust}% lies=${data.lies ?? 0}`
      : 'Could not parse CreepJS trust score from DOM — score not fabricated',
    parsed,
    { trust: data.trust ?? undefined, lies: data.lies ?? undefined },
  );
}

async function checkIphey(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://iphey.com/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(10_000);

  const data = await page.evaluate(() => {
    const badges = [...document.querySelectorAll('[class*="badge"], [class*="status"], [class*="result"]')];
    for (const el of badges) {
      const t = el.textContent?.toLowerCase() ?? '';
      if (t.includes('trustworthy') || t.includes('consistent')) return { pass: true, parsed: true };
      if (t.includes('bot') || t.includes('suspicious')) return { pass: false, parsed: true };
    }
    return { pass: false, parsed: false };
  });

  return siteResult(
    'iphey',
    url,
    data.parsed ? data.pass : false,
    data.parsed ? (data.pass ? 85 : 30) : null,
    data.parsed ? (data.pass ? 'iphey: trustworthy' : 'iphey: flagged') : 'Could not parse iphey result',
    data.parsed,
  );
}

async function checkPixelscan(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://pixelscan.net/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(12_000);

  const data = await page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    const m = text.match(/(\d{1,3})\s*%\s*consistent/i) ?? text.match(/consistency[:\s]+(\d{1,3})/i);
    if (m) return { score: parseInt(m[1], 10), parsed: true };
    if (/bot|inconsistent|detected/i.test(text)) return { score: 0, parsed: true, fail: true };
    return { score: null, parsed: false };
  });

  const pass = data.parsed && data.score != null ? data.score >= DEFAULT_MIN_DETECTION_SCORE : false;
  return siteResult(
    'Pixelscan',
    url,
    pass,
    data.parsed ? data.score : null,
    data.parsed && data.score != null ? `consistency=${data.score}%` : 'Could not parse Pixelscan score',
    data.parsed,
  );
}

async function checkSannysoft(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://bot.sannysoft.com/';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tr')];
    let failed = 0;
    let total = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;
      total++;
      const status = cells[1]?.textContent?.toLowerCase() ?? '';
      if (status.includes('fail')) failed++;
    }
    return { failed, total, parsed: total > 0 };
  });

  const score = data.parsed ? Math.round(((data.total - data.failed) / data.total) * 100) : null;
  const pass = data.parsed ? data.failed <= 1 : false;
  return siteResult(
    'Sannysoft',
    url,
    pass,
    score,
    data.parsed ? `${data.total - data.failed}/${data.total} checks passed` : 'Could not parse Sannysoft table',
    data.parsed,
  );
}

const PRIVATE_IP_RE = /\b(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+)\b/;

async function checkBrowserLeaksWebRtc(page: Page): Promise<DetectionSiteResult> {
  const url = 'https://browserleaks.com/webrtc';
  await page.goto(url, NAV_OPTS).catch(() => {});
  await page.waitForTimeout(5000);
  const html = await page.content();
  const hasPrivateIp = PRIVATE_IP_RE.test(html);
  return siteResult(
    'BrowserLeaks WebRTC',
    url,
    !hasPrivateIp,
    hasPrivateIp ? 0 : 100,
    hasPrivateIp ? 'Local/private IP visible' : 'No local IP leak',
    true,
  );
}

export const DETECTION_ENGINE_TESTS = [
  { name: 'CreepJS', fn: checkCreepJS },
  { name: 'iphey', fn: checkIphey },
  { name: 'Pixelscan', fn: checkPixelscan },
  { name: 'Sannysoft', fn: checkSannysoft },
  { name: 'BrowserLeaks WebRTC', fn: checkBrowserLeaksWebRtc },
] as const;

function aggregateScores(sites: DetectionSiteResult[]): { detectionScore: number; minEngineScore: number; externalScore: number } {
  const parsed = sites.filter((s) => s.parsed && s.score != null);
  if (parsed.length === 0) return { detectionScore: 0, minEngineScore: 0, externalScore: 0 };
  const scores = parsed.map((s) => s.score!);
  const passed = parsed.filter((s) => s.pass).length;
  return {
    detectionScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    minEngineScore: Math.min(...scores),
    externalScore: Math.round((passed / sites.length) * 100),
  };
}

export async function validateFingerprintQuickExternal(page: Page): Promise<ExternalValidationReport> {
  const quick = await validateFingerprintQuick(page);
  const sanny = await checkSannysoft(page);
  const sites = [sanny];
  const agg = aggregateScores(sites);
  const combinedScore = sanny.parsed
    ? Math.round((quick.score + (sanny.score ?? 0)) / 2)
    : quick.score;

  return {
    ...quick,
    selfReferential: false,
    externalScore: agg.externalScore,
    detectionScore: combinedScore,
    minEngineScore: sanny.parsed ? Math.min(quick.score, sanny.score ?? 0) : quick.score,
    sites,
    score: combinedScore,
    passed: quick.passed + (sanny.pass ? 1 : 0),
    total: quick.total + 1,
  };
}

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
      sites.push(siteResult(test.name, '', false, null, err instanceof Error ? err.message : String(err), false));
    }
  }

  const agg = aggregateScores(sites);
  const externalChecks: ValidationCheck[] = sites.map((s) => ({
    name: s.name,
    pass: s.parsed ? s.pass && (s.score ?? 0) >= minScore : false,
    detail: s.parsed ? `${s.detail} (score=${s.score})` : s.detail,
  }));

  return {
    ...quick,
    selfReferential: false,
    score: agg.detectionScore,
    passed: sites.filter((s) => s.parsed && s.pass).length,
    total: sites.length,
    checks: [...quick.checks, ...externalChecks],
    externalScore: agg.externalScore,
    detectionScore: agg.detectionScore,
    minEngineScore: agg.minEngineScore,
    sites,
  };
}
