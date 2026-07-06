import type { FingerprintConfig } from '../types/profile.js';
import { seedInt } from '../core/fingerprint/seed.js';

/** Fingerprint screen sizes (what sites read via JS) — desktop pool */
export const DESKTOP_FINGERPRINT_SCREENS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 2560, height: 1440 },
] as const;

/** Standard mobile fingerprint + viewport sizes */
export const MOBILE_PRESETS = [
  { width: 390, height: 844, devicePixelRatio: 3, device: 'iOS' as const },
  { width: 393, height: 852, devicePixelRatio: 3, device: 'iOS' as const },
  { width: 360, height: 800, devicePixelRatio: 3, device: 'Android' as const },
  { width: 412, height: 915, devicePixelRatio: 2.625, device: 'Android' as const },
  { width: 384, height: 854, devicePixelRatio: 2.75, device: 'Android' as const },
] as const;

export function pickDesktopFingerprintScreen(seed: string): { width: number; height: number } {
  const idx = seedInt(`${seed}:fingerprint-screen`, 0, DESKTOP_FINGERPRINT_SCREENS.length - 1);
  return DESKTOP_FINGERPRINT_SCREENS[idx];
}

export function pickMobilePreset(seed: string, device: 'iOS' | 'Android') {
  const pool = MOBILE_PRESETS.filter((p) => p.device === device);
  const idx = seedInt(`${seed}:mobile-preset`, 0, pool.length - 1);
  return pool[idx] ?? MOBILE_PRESETS[0];
}

export interface DisplaySize {
  width: number;
  height: number;
}

/**
 * Launch viewport (window) ≠ fingerprint screen.
 * Desktop: maximize to the user's work area; mobile: standard device viewport.
 */
export function computeLaunchViewport(
  fp: FingerprintConfig,
  display?: DisplaySize,
): { width: number; height: number } {
  const isMobile = fp.formFactor === 'mobile';
  const screenW = fp.screenWidth ?? fp.windowWidth;
  const screenH = fp.screenHeight ?? fp.windowHeight;

  if (isMobile) {
    return {
      width: fp.windowWidth || screenW,
      height: fp.windowHeight || screenH,
    };
  }

  if (display?.width && display?.height) {
    return { width: display.width, height: display.height };
  }

  return {
    width: Math.max(screenW, 1280),
    height: Math.max(screenH, 720),
  };
}

/** Inner viewport (window.innerWidth/Height) — subtract browser chrome UI on desktop. */
export function computeLaunchInnerViewport(
  fp: FingerprintConfig,
  display?: DisplaySize,
): { width: number; height: number } {
  const outer = computeLaunchViewport(fp, display);
  if (fp.formFactor === 'mobile') return outer;
  const chromeUi = 132;
  return {
    width: outer.width,
    height: Math.max(600, outer.height - chromeUi),
  };
}

/** Desktop profiles should open maximized (fingerprint screen stays separate in JS). */
export function shouldMaximizeLaunchWindow(fp: FingerprintConfig): boolean {
  return fp.formFactor !== 'mobile';
}
