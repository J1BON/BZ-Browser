import type { BrowserContext, Page } from 'playwright-core';
import type { RpaAction, RpaScript, RpaReplayResult } from '../../types/rpa.js';
import { humanClick, humanDelay, humanScroll } from './human-input.js';

export class RpaPlayer {
  async replay(context: BrowserContext, script: RpaScript): Promise<RpaReplayResult> {
    const start = Date.now();
    let stepsCompleted = 0;
    const page = context.pages()[0] ?? await context.newPage();
    const totalSteps = countSteps(script.actions);

    try {
      stepsCompleted = await this.runActions(page, script.actions, stepsCompleted);
      return {
        scriptId: script.id,
        success: true,
        stepsCompleted,
        totalSteps,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        scriptId: script.id,
        success: false,
        stepsCompleted,
        totalSteps,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async runActions(page: Page, actions: RpaAction[], completed: number): Promise<number> {
    for (const action of actions) {
      completed = await this.runAction(page, action, completed);
    }
    return completed;
  }

  private async runAction(page: Page, action: RpaAction, completed: number): Promise<number> {
    switch (action.type) {
      case 'loop': {
        const nested = action.actions ?? [];
        const count = Math.max(1, action.count ?? 1);
        for (let i = 0; i < count; i++) {
          completed = await this.runActions(page, nested, completed);
        }
        return completed + 1;
      }
      case 'condition': {
        const nested = action.actions ?? [];
        const elseNested = action.elseActions ?? [];
        if (action.selector) {
          const visible = await page.locator(action.selector).first().isVisible().catch(() => false);
          completed = await this.runActions(page, visible ? nested : elseNested, completed);
        } else {
          completed = await this.runActions(page, nested, completed);
        }
        return completed + 1;
      }
      case 'goto':
        if (action.url && !action.url.startsWith('about:')) {
          await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
          await humanDelay(500, 1500);
        }
        break;
      case 'click':
        if (action.selector) {
          await humanClick(page, action.selector).catch(() => {});
          await humanDelay(300, 900);
        }
        break;
      case 'fill':
        if (action.selector && action.value != null) {
          await page.fill(action.selector, action.value).catch(() => {});
          await humanDelay(200, 600);
        }
        break;
      case 'scroll':
        await humanScroll(page, 300);
        await humanDelay(400, 1000);
        break;
      case 'wait':
        await humanDelay(action.delayMs ?? 1000, (action.delayMs ?? 1000) + 500);
        break;
      case 'keydown':
        if (action.value) {
          await page.keyboard.press(action.value).catch(() => {});
        }
        break;
    }
    return completed + 1;
  }
}

function countSteps(actions: RpaAction[]): number {
  let n = 0;
  for (const a of actions) {
    if (a.type === 'loop') {
      n += 1 + (a.actions?.length ?? 0) * Math.max(1, a.count ?? 1);
    } else if (a.type === 'condition') {
      n += 1 + Math.max(a.actions?.length ?? 0, a.elseActions?.length ?? 0);
    } else {
      n += 1;
    }
  }
  return Math.max(n, 1);
}

export const rpaPlayer = new RpaPlayer();
