import { z } from 'zod';

export interface RpaAction {
  type: 'goto' | 'click' | 'fill' | 'scroll' | 'wait' | 'keydown' | 'loop' | 'condition';
  url?: string;
  selector?: string;
  value?: string;
  delayMs?: number;
  timestamp?: number;
  count?: number;
  actions?: RpaAction[];
  elseActions?: RpaAction[];
}

export const RpaActionSchema: z.ZodType<RpaAction> = z.lazy(() =>
  z.object({
    type: z.enum(['goto', 'click', 'fill', 'scroll', 'wait', 'keydown', 'loop', 'condition']),
    url: z.string().optional(),
    selector: z.string().optional(),
    value: z.string().optional(),
    delayMs: z.number().optional(),
    timestamp: z.number().optional(),
    count: z.number().optional(),
    actions: z.array(RpaActionSchema).optional(),
    elseActions: z.array(RpaActionSchema).optional(),
  }),
);

export const RpaScriptSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  profileId: z.string().uuid().optional(),
  actions: z.array(RpaActionSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  durationMs: z.number().optional(),
});

export type RpaScript = z.infer<typeof RpaScriptSchema>;

export interface RpaRecordingState {
  profileId: string;
  recording: boolean;
  actionCount: number;
  startedAt: number | null;
}

export interface RpaReplayResult {
  scriptId: string;
  success: boolean;
  stepsCompleted: number;
  totalSteps: number;
  durationMs: number;
  error?: string;
}
