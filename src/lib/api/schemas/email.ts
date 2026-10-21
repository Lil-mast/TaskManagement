import { z } from 'zod';

import { idSchema, isoDateTimeSchema } from './common';

export const triageCategorySchema = z.enum(['reply', 'fyi', 'task', 'ignore']);

export const triageRowSchema = z
  .object({
    gmail_msg_id: z.string(),
    user_id: z.string(),
    category: z.string(),
    summary: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    state: z.string(),
    suggested_task_id: idSchema.nullable().optional(),
    triaged_at: isoDateTimeSchema,
  })
  .passthrough();

export type TriageRow = z.infer<typeof triageRowSchema>;

export const triageRunSchema = z
  .object({
    stored: z.number().int(),
    open: z.array(triageRowSchema),
  })
  .passthrough();

export type TriageRun = z.infer<typeof triageRunSchema>;

export const triageActResponseSchema = z.object({ acted: z.unknown() }).passthrough();

export type TriageState = 'open' | 'done' | 'task_created' | 'all';

export interface TriageAction {
  action: 'done' | 'task';
  task_title?: string;
}
