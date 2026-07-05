import type { WarmupPreset } from '../../types/warmup.js';

const _RAW_PRESETS = [
  {
    id: 'google-news',
    name: 'Google & News',
    description: 'Search Google, visit news sites — builds search/cookie history',
    category: 'search' as const,
    steps: [
      { url: 'https://www.google.com', dwellMs: 4000, scrolls: 1, actions: [] as const },
      { url: 'https://news.google.com', dwellMs: 6000, scrolls: 3, actions: [] as const },
      { url: 'https://www.bbc.com', dwellMs: 5000, scrolls: 2, actions: [] as const },
    ],
  },
  {
    id: 'social-warmup',
    name: 'Social Scroll',
    description: 'Browse Reddit and Wikipedia — natural social/content cookies',
    category: 'social' as const,
    steps: [
      { url: 'https://www.reddit.com', dwellMs: 7000, scrolls: 4, actions: [] as const },
      { url: 'https://en.wikipedia.org/wiki/Main_Page', dwellMs: 5000, scrolls: 2, actions: [] as const },
      { url: 'https://www.youtube.com', dwellMs: 6000, scrolls: 3, actions: [] as const },
    ],
  },
  {
    id: 'ecommerce-browse',
    name: 'E-Commerce Browse',
    description: 'Browse shopping sites — ad/retargeting cookie patterns',
    category: 'ecommerce' as const,
    steps: [
      { url: 'https://www.amazon.com', dwellMs: 6000, scrolls: 3, actions: [] as const },
      { url: 'https://www.ebay.com', dwellMs: 5000, scrolls: 2, actions: [] as const },
      { url: 'https://www.etsy.com', dwellMs: 5000, scrolls: 2, actions: [] as const },
    ],
  },
  {
    id: 'full-warmup',
    name: 'Full Warmup (15 min)',
    description: 'Comprehensive multi-site warmup for new accounts',
    category: 'general' as const,
    steps: [
      { url: 'https://www.google.com', dwellMs: 5000, scrolls: 1, actions: [] as const },
      { url: 'https://news.google.com', dwellMs: 6000, scrolls: 2, actions: [] as const },
      { url: 'https://www.reddit.com', dwellMs: 8000, scrolls: 4, actions: [] as const },
      { url: 'https://www.amazon.com', dwellMs: 7000, scrolls: 3, actions: [] as const },
      { url: 'https://www.youtube.com', dwellMs: 8000, scrolls: 4, actions: [] as const },
      { url: 'https://en.wikipedia.org/wiki/Special:Random', dwellMs: 5000, scrolls: 2, actions: [] as const },
    ],
  },
];

export const WARMUP_PRESETS = _RAW_PRESETS as unknown as WarmupPreset[];

export function getWarmupPreset(id: string): WarmupPreset | undefined {
  return WARMUP_PRESETS.find((p) => p.id === id);
}

export function listWarmupPresets(): WarmupPreset[] {
  return WARMUP_PRESETS;
}
