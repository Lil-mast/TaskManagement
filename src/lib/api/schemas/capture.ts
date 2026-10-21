import { z } from 'zod';

import { confidenceSchema, isoDateSchema, prioritySchema } from './common';

export const proposedTaskSchema = z
  .object({
    title: z.string(),
    description: z.string().nullable().optional(),
    priority: prioritySchema,
    due_date: isoDateSchema.nullable().optional(),
    tags: z.array(z.string()).default([]),
    confidence: confidenceSchema.nullable().optional(),
  })
  .passthrough();

export type ProposedTask = z.infer<typeof proposedTaskSchema>;

export const captureResponseSchema = z
  .object({
    tasks: z.array(proposedTaskSchema),
    saved_to_db: z.number().nullable().optional(),
  })
  .passthrough();

export type CaptureResponse = z.infer<typeof captureResponseSchema>;

export interface CaptureInput {
  text: string;
  /** Proposals only by default. Never persist without an explicit human accept. */
  persist?: boolean;
}
