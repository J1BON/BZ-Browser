import { z } from 'zod';

export const WarmupActionSchema = z.object({
  type: z.enum(['scroll', 'wait', 'click', 'type']),
  value: z.union([z.string(), z.number()]).optional(),
});

export const WarmupStepSchema = z.object({
  url: z.string(),
  dwellMs: z.number().default(5000),
  scrolls: z.number().default(2),
  actions: z.array(WarmupActionSchema).default([]),
});

export const WarmupPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['general', 'social', 'ecommerce', 'search']),
  steps: z.array(WarmupStepSchema),
});

export type WarmupAction = z.infer<typeof WarmupActionSchema>;
export type WarmupStep = z.infer<typeof WarmupStepSchema>;
export type WarmupPreset = z.infer<typeof WarmupPresetSchema>;

export interface WarmupProgress {
  presetId: string;
  stepIndex: number;
  totalSteps: number;
  url: string;
  status: 'running' | 'done' | 'error';
  message?: string;
}

export interface WarmupResult {
  presetId: string;
  success: boolean;
  stepsCompleted: number;
  totalSteps: number;
  cookiesSet: number;
  durationMs: number;
  error?: string;
}
