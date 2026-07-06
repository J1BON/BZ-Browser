import type { BrowserContext, Page } from 'playwright-core';
import type { RpaAction, RpaRecordingState } from '../../types/rpa.js';

const RECORDER_INIT_SCRIPT = `
(function() {
  if (window.__rpaRecorderActive) return;
  window.__rpaRecorderActive = true;

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.name && ['INPUT','SELECT','TEXTAREA','BUTTON'].indexOf(el.tagName) >= 0) {
      return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    }
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 5) {
      var part = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        var cls = cur.className.trim().split(/\\s+/).slice(0, 2).join('.');
        if (cls) part += '.' + cls;
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function push(action) {
    if (typeof window.__rpaPush === 'function') {
      window.__rpaPush(action);
    }
  }

  document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t || t.closest('[data-rpa-ignore]')) return;
    push({ type: 'click', selector: cssPath(t), timestamp: Date.now() });
  }, true);

  document.addEventListener('change', function(e) {
    var t = e.target;
    if (!t || !('value' in t)) return;
    push({ type: 'fill', selector: cssPath(t), value: String(t.value || ''), timestamp: Date.now() });
  }, true);

  var scrollTimer = null;
  window.addEventListener('scroll', function() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function() {
      scrollTimer = null;
      push({ type: 'scroll', value: String(window.scrollY), timestamp: Date.now() });
    }, 400);
  }, true);
})();
`;

export class RpaRecorder {
  private actions: RpaAction[] = [];
  private recording = false;
  private profileId: string | null = null;
  private startedAt: number | null = null;
  private boundContexts = new WeakSet<BrowserContext>();
  private pageListeners = new Map<Page, (frame: import('playwright-core').Frame) => void>();
  private contextPageListeners = new Map<BrowserContext, (page: Page) => void>();

  async start(context: BrowserContext, profileId: string): Promise<RpaRecordingState> {
    this.actions = [];
    this.recording = true;
    this.profileId = profileId;
    this.startedAt = Date.now();

    if (!this.boundContexts.has(context)) {
      await context.exposeFunction('__rpaPush', (action: RpaAction) => {
        if (!this.recording) return;
        if (action.type === 'goto') {
          this.actions.push(action);
          return;
        }
        const last = this.actions[this.actions.length - 1];
        if (action.type === 'scroll' && last?.type === 'scroll') return;
        this.actions.push(action);
      });

      await context.addInitScript({ content: RECORDER_INIT_SCRIPT });
      this.boundContexts.add(context);
    }

    for (const page of context.pages()) {
      await this.attachPage(page);
    }

    const pageListener = (page: Page) => {
      void this.attachPage(page);
    };
    context.on('page', pageListener);
    this.contextPageListeners.set(context, pageListener);

    return this.getState();
  }

  private async attachPage(page: Page): Promise<void> {
    await page.evaluate(RECORDER_INIT_SCRIPT).catch(() => {});
    const frameListener = (frame: import('playwright-core').Frame) => {
      if (frame === page.mainFrame() && this.recording) {
        this.actions.push({
          type: 'goto',
          url: frame.url(),
          timestamp: Date.now(),
        });
      }
    };
    page.on('framenavigated', frameListener);
    this.pageListeners.set(page, frameListener);
  }

  stop(): { actions: RpaAction[]; durationMs: number } {
    this.recording = false;
    const durationMs = this.startedAt ? Date.now() - this.startedAt : 0;
    this.startedAt = null;
    const actions = [...this.actions];
    this.actions = [];
    this.profileId = null;
    // Clean up stored listeners to prevent leaks
    this.pageListeners.clear();
    this.contextPageListeners.clear();
    return { actions, durationMs };
  }

  getState(): RpaRecordingState {
    return {
      profileId: this.profileId ?? '',
      recording: this.recording,
      actionCount: this.actions.length,
      startedAt: this.startedAt,
    };
  }

  isRecording(profileId?: string): boolean {
    if (!this.recording) return false;
    if (profileId) return this.profileId === profileId;
    return true;
  }
}

export const rpaRecorder = new RpaRecorder();
