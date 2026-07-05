import type { BrowserContext } from 'playwright-core';
import type { WarmupProgress, WarmupResult } from '../../types/warmup.js';
import { getWarmupPreset } from './warmup-presets.js';
import { humanBrowse, humanDelay } from './human-input.js';

export class WarmupRunner {
  async run(
    context: BrowserContext,
    presetId: string,
    onProgress?: (p: WarmupProgress) => void,
  ): Promise<WarmupResult> {
    const preset = getWarmupPreset(presetId);
    const start = Date.now();

    if (!preset) {
      return {
        presetId,
        success: false,
        stepsCompleted: 0,
        totalSteps: 0,
        cookiesSet: 0,
        durationMs: 0,
        error: `Preset not found: ${presetId}`,
      };
    }

    let stepsCompleted = 0;
    const page = context.pages()[0] ?? await context.newPage();

    try {
      for (let i = 0; i < preset.steps.length; i++) {
        const step = preset.steps[i];
        onProgress?.({
          presetId,
          stepIndex: i,
          totalSteps: preset.steps.length,
          url: step.url,
          status: 'running',
        });

        await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await humanDelay(800, 2000);
        await humanBrowse(page, step.scrolls);
        await humanDelay(step.dwellMs * 0.5, step.dwellMs);

        stepsCompleted++;
        onProgress?.({
          presetId,
          stepIndex: i,
          totalSteps: preset.steps.length,
          url: step.url,
          status: 'done',
        });
      }

      const cookies = await context.cookies();
      return {
        presetId,
        success: true,
        stepsCompleted,
        totalSteps: preset.steps.length,
        cookiesSet: cookies.length,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const cookies = await context.cookies().catch(() => []);
      return {
        presetId,
        success: false,
        stepsCompleted,
        totalSteps: preset.steps.length,
        cookiesSet: cookies.length,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const warmupRunner = new WarmupRunner();
