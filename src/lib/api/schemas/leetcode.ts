import { z } from 'zod';

import { idSchema, isoDateSchema, isoDateTimeSchema } from './common';

export const leetCodePatternSchema = z
  .object({
    id: idSchema,
    user_id: z.string(),
    name: z.string(),
    notes: z.string().nullable().optional(),
    confidence: z.number().int(),
    next_review: isoDateSchema.nullable().optional(),
    ease: z.number(),
  })
  .passthrough();

export type LeetCodePattern = z.infer<typeof leetCodePatternSchema>;

export const leetCodeAttemptSchema = z
  .object({
    id: idSchema,
    user_id: z.string(),
    problem_url: z.string(),
    problem_title: z.string().nullable().optional(),
    difficulty: z.string().nullable().optional(),
    pattern_id: idSchema.nullable().optional(),
    time_taken_min: z.number().int().nullable().optional(),
    needed_help: z.boolean().nullable().optional(),
    notes: z.string().nullable().optional(),
    attempted_at: isoDateTimeSchema,
  })
  .passthrough();

export type LeetCodeAttempt = z.infer<typeof leetCodeAttemptSchema>;

export const rescheduleSchema = z
  .object({
    next_review: isoDateSchema,
    interval_days: z.number().int(),
    ease: z.number(),
  })
  .passthrough();

export const attemptResultSchema = z
  .object({
    attempt: leetCodeAttemptSchema,
    reschedule: rescheduleSchema,
    review_task_id: idSchema.nullable().optional(),
    review_due: isoDateSchema.nullable().optional(),
  })
  .passthrough();

export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const patternStatSchema = z
  .object({
    pattern: z.string(),
    attempts: z.number().int(),
    no_help_rate: z.number(),
    avg_time_min: z.number(),
  })
  .passthrough();

export type PatternStat = z.infer<typeof patternStatSchema>;

export interface PatternUpsertInput {
  name: string;
  notes?: string;
  confidence?: number;
}

export interface LogAttemptInput {
  problem_url: string;
  problem_title?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  pattern_id?: string;
  time_taken_min?: number;
  needed_help?: boolean;
  notes?: string;
}
