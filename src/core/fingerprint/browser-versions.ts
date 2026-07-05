/** Chrome major versions to rotate in generated profiles (keep reasonably current). */
export const CHROME_MAJORS = ['131', '132', '133', '134', '135', '136'] as const;

export const DEFAULT_CHROME_MAJOR = CHROME_MAJORS[CHROME_MAJORS.length - 1];

export function pickChromeMajor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % CHROME_MAJORS.length;
  return CHROME_MAJORS[idx] ?? DEFAULT_CHROME_MAJOR;
}

export function buildChromeVersion(major: string, seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const build = 6000 + (Math.abs(h) % 800);
  const patch = Math.abs(h >> 8) % 200;
  return `${major}.0.${build}.${patch}`;
}
