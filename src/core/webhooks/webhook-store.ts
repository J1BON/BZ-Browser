import fs from 'fs/promises';
import path from 'path';
import { createHmac, randomBytes } from 'crypto';

export type WebhookEvent =
  | 'profile.closed'
  | 'profile.launched'
  | 'profile.created'
  | 'sync.completed';

export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
  lastStatus?: 'ok' | 'error';
  lastError?: string;
}

export interface WebhookDeliveryResult {
  webhookId: string;
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class WebhookStore {
  private filePath: string;
  private hooks: WebhookConfig[] = [];

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'webhooks.json');
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.hooks = JSON.parse(raw) as WebhookConfig[];
    } catch (err) {
      console.warn('[WebhookStore] webhooks.json corrupt:', (err as Error).message, '— backing up and starting fresh');
      await fs.rename(this.filePath, this.filePath + '.corrupt').catch(() => {});
      this.hooks = [];
    }
  }

  async save(): Promise<void> {
    const tmp = this.filePath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.hooks, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  list(): WebhookConfig[] {
    return [...this.hooks];
  }

  async create(url: string, events: WebhookEvent[], secret?: string): Promise<WebhookConfig> {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Webhook URL must use http or https protocol');
    }
    const hook: WebhookConfig = {
      id: randomBytes(8).toString('hex'),
      url,
      events,
      secret: secret || undefined,
      enabled: true,
      createdAt: Date.now(),
    };
    this.hooks.push(hook);
    await this.save();
    return hook;
  }

  async update(id: string, patch: Partial<Pick<WebhookConfig, 'url' | 'events' | 'secret' | 'enabled'>>): Promise<WebhookConfig | null> {
    const hook = this.hooks.find((h) => h.id === id);
    if (!hook) return null;
    if (patch.url !== undefined) hook.url = patch.url;
    if (patch.events !== undefined) hook.events = patch.events;
    if (patch.secret !== undefined) hook.secret = patch.secret || undefined;
    if (patch.enabled !== undefined) hook.enabled = patch.enabled;
    await this.save();
    return hook;
  }

  async remove(id: string): Promise<void> {
    this.hooks = this.hooks.filter((h) => h.id !== id);
    await this.save();
  }

  async dispatch(event: WebhookEvent, data: Record<string, unknown>): Promise<WebhookDeliveryResult[]> {
    const payload = {
      event,
      timestamp: Date.now(),
      data,
    };
    const body = JSON.stringify(payload);
    const targets = this.hooks.filter((h) => h.enabled && h.events.includes(event));
    const results: WebhookDeliveryResult[] = [];

    const deliveries = targets.map(async (hook) => {
      const result = await this.deliver(hook, body, event).catch((err) => ({
        webhookId: hook.id,
        url: hook.url,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }));
      results.push(result);
      hook.lastTriggeredAt = Date.now();
      hook.lastStatus = result.success ? 'ok' : 'error';
      hook.lastError = result.error;
    });

    await Promise.all(deliveries);

    if (targets.length > 0) await this.save();
    return results;
  }

  async test(id: string): Promise<WebhookDeliveryResult> {
    const hook = this.hooks.find((h) => h.id === id);
    if (!hook) return { webhookId: id, url: '', success: false, error: 'Webhook not found' };
    const body = JSON.stringify({
      event: 'test.ping',
      timestamp: Date.now(),
      data: { message: 'BZ Browser webhook test' },
    });
    const result = await this.deliver(hook, body, 'profile.opened' as WebhookEvent);
    hook.lastTriggeredAt = Date.now();
    hook.lastStatus = result.success ? 'ok' : 'error';
    hook.lastError = result.error;
    await this.save();
    return result;
  }

  private async deliver(hook: WebhookConfig, body: string, event: WebhookEvent): Promise<WebhookDeliveryResult> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'BZBrowser-Webhook/1.0',
        'X-CAB-Event': event,
      };
      if (hook.secret) {
        const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
        headers['X-CAB-Signature'] = `sha256=${sig}`;
      }

      const res = await fetch(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return {
          webhookId: hook.id,
          url: hook.url,
          success: false,
          statusCode: res.status,
          error: `HTTP ${res.status}`,
        };
      }

      return { webhookId: hook.id, url: hook.url, success: true, statusCode: res.status };
    } catch (err) {
      return {
        webhookId: hook.id,
        url: hook.url,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
