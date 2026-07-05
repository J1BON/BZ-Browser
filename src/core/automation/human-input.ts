import type { Page } from 'playwright-core';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export async function humanDelay(minMs = 300, maxMs = 1200): Promise<void> {
  await new Promise((r) => setTimeout(r, rand(minMs, maxMs)));
}

/** Cubic bezier point */
function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export async function humanMouseMove(page: Page, toX: number, toY: number): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const fromX = rand(viewport.width * 0.2, viewport.width * 0.8);
  const fromY = rand(viewport.height * 0.2, viewport.height * 0.8);
  const cp1x = fromX + rand(-80, 80);
  const cp1y = fromY + rand(-60, 60);
  const cp2x = toX + rand(-80, 80);
  const cp2y = toY + rand(-60, 60);
  const steps = Math.floor(rand(18, 32));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = bezier(t, fromX, cp1x, cp2x, toX);
    const y = bezier(t, fromY, cp1y, cp2y, toY);
    await page.mouse.move(x, y, { steps: 1 });
    await new Promise((r) => setTimeout(r, rand(8, 22)));
  }
}

export async function humanScroll(page: Page, totalPixels: number): Promise<void> {
  let scrolled = 0;
  while (scrolled < totalPixels) {
    const chunk = rand(80, 220);
    await page.mouse.wheel(0, chunk);
    scrolled += chunk;
    await humanDelay(120, 450);
  }
}

export async function humanBrowse(page: Page, scrollCount: number): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  for (let i = 0; i < scrollCount; i++) {
    const x = rand(viewport.width * 0.15, viewport.width * 0.85);
    const y = rand(viewport.height * 0.2, viewport.height * 0.7);
    await humanMouseMove(page, x, y);
    await humanDelay(200, 800);
    await humanScroll(page, rand(200, 600));
    await humanDelay(500, 2000);
  }
}

export async function humanClick(page: Page, selector?: string): Promise<void> {
  if (selector) {
    const el = page.locator(selector).first();
    if (await el.count() > 0) {
      const box = await el.boundingBox();
      if (box) {
        const x = box.x + box.width * rand(0.3, 0.7);
        const y = box.y + box.height * rand(0.3, 0.7);
        await humanMouseMove(page, x, y);
        await humanDelay(100, 400);
        await page.mouse.click(x, y);
        return;
      }
    }
  }
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = rand(viewport.width * 0.2, viewport.width * 0.8);
  const y = rand(viewport.height * 0.2, viewport.height * 0.8);
  await humanMouseMove(page, x, y);
  await humanDelay(80, 300);
  await page.mouse.click(x, y);
}
