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
}

const VALIDATION_SCRIPT = `
(() => {
  const checks = [];
  function add(name, pass, detail) { checks.push({ name, pass, detail: String(detail ?? '') }); }

  add('webdriver_hidden', navigator.webdriver !== true, 'webdriver=' + navigator.webdriver);
  add('no_playwright', !window.__playwright && !window.__pw_manual, 'playwright artifacts');
  add('chrome_runtime', !!(window.chrome && window.chrome.runtime), 'chrome.runtime');
  add('languages', navigator.languages && navigator.languages.length >= 1, navigator.languages?.join(','));
  add('platform', !!navigator.platform, navigator.platform);
  add('plugins', navigator.plugins && navigator.plugins.length > 0, String(navigator.plugins?.length ?? 0));
  add('cpu', (navigator.hardwareConcurrency ?? 0) >= 2, String(navigator.hardwareConcurrency));
  add('memory', (navigator.deviceMemory ?? 0) >= 2, String(navigator.deviceMemory ?? 'n/a'));
  add('webrtc_blocked', typeof RTCPeerConnection === 'undefined', 'RTCPeerConnection');
  add('screen', screen.width > 0 && screen.height > 0, screen.width + 'x' + screen.height);
  add('viewport', window.innerWidth > 0 && window.innerHeight > 0, window.innerWidth + 'x' + window.innerHeight);
  add('dpr', window.devicePixelRatio >= 1, String(window.devicePixelRatio));
  add('timezone', !!Intl.DateTimeFormat().resolvedOptions().timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  add('dnt_null', navigator.doNotTrack === null || navigator.doNotTrack === 'unspecified', String(navigator.doNotTrack));

  if (navigator.userAgentData) {
    const uad = navigator.userAgentData;
    add('uad_platform', !!uad.platform, uad.platform);
    add('uad_mobile', uad.mobile === (navigator.maxTouchPoints > 0), 'mobile=' + uad.mobile);
    add('uad_brands', uad.brands && uad.brands.length > 0, uad.brands?.map(b => b.brand).join(','));
  } else {
    add('uad_present', false, 'missing userAgentData');
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '16px Arial';
    ctx.fillText('antidetect-probe', 4, 8);
    const d1 = canvas.toDataURL().slice(-24);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    add('canvas_export', d1.length > 8, d1);
    add('canvas_read', img.data.length > 0, String(img.data.length));
  } catch (e) {
    add('canvas', false, e.message);
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(7936);
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(7937);
      add('webgl_vendor', !!vendor && /NVIDIA|AMD|Intel|Apple|ANGLE|Mesa/i.test(String(vendor)), String(vendor).slice(0, 60));
      add('webgl_renderer', !!renderer, String(renderer).slice(0, 80));
    } else add('webgl', false, 'no context');
  } catch (e) {
    add('webgl', false, e.message);
  }

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      add('audio_context', !!analyser, 'ok');
      ctx.close();
    } else add('audio_context', false, 'missing');
  } catch (e) {
    add('audio_context', false, e.message);
  }

  if (window.speechSynthesis) {
    const voices = speechSynthesis.getVoices();
    add('speech_voices', voices.length >= 1, String(voices.length));
  }

  return checks;
})();
`;

export async function validateFingerprint(page: Page): Promise<ValidationReport> {
  await page.goto('about:blank').catch(() => {});

  const checks = await page.evaluate(VALIDATION_SCRIPT) as ValidationCheck[];

  // mediaDevices is async — evaluate separately
  const mediaCheck = await page.evaluate(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return { name: 'media_devices', pass: false, detail: 'missing' };
    const devs = await navigator.mediaDevices.enumerateDevices();
    return { name: 'media_devices', pass: devs.length >= 3, detail: devs.length + ' devices' };
  }).catch(() => ({ name: 'media_devices', pass: false, detail: 'error' }));

  const allChecks = [...checks, mediaCheck];
  const passed = allChecks.filter((c) => c.pass).length;
  const total = allChecks.length || 1;

  return {
    score: Math.round((passed / total) * 100),
    passed,
    total,
    checks: allChecks,
    timestamp: Date.now(),
  };
}
