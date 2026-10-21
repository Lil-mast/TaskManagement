import { z } from 'zod';

import { isoDateSchema } from './common';

export const priorityCountSchema = z
  .object({
    priority: z.string(),
    n: z.number().int(),
  })
  .passthrough();

export const bookStatsSchema = z
  .object({
    book: z.string(),
    accepted_total: z.number().int(),
    surfaced_this_week: z.number().int(),
    quarantined: z.number().int(),
  })
  .passthrough();

export const taskStatsSchema = z
  .object({
    completed: z.number().int(),
    completed_by_priority: z.array(priorityCountSchema),
    completed_prev_week: z.number().int(),
    created: z.number().int(),
    carried_over: z.number().int(),
    overdue: z.number().int(),
  })
  .passthrough();

export const leetCodeStatsSchema = z
  .object({
    attempts: z.number().int(),
    no_help_rate: z.number(),
    attempts_prev: z.number().int(),
    no_help_rate_prev: z.number(),
    patterns_due: z.number().int(),
  })
  .passthrough();

export const inboxStateSchema = z
  .object({
    open_reply: z.number().int(),
    open_task: z.number().int(),
    acted_total: z.number().int(),
  })
  .passthrough();

export const weeklyAnalyticsSchema = z
  .object({
    week_start: isoDateSchema,
    week_end: isoDateSchema,
    tasks: taskStatsSchema,
    leetcode: leetCodeStatsSchema,
    inbox: inboxStateSchema,
    principles: z.array(bookStatsSchema),
  })
  .passthrough();

export type WeeklyAnalytics = z.infer<typeof weeklyAnalyticsSchema>;

export const storedReviewSchema = z
  .object({
    user_id: z.string(),
    week_start: isoDateSchema,
    /** Narrative shape may evolve; render defensively. */
    payload: z.unknown(),
    model: z.string(),
  })
  .passthrough();

export type StoredReview = z.infer<typeof storedReviewSchema>;

export const weeklyReviewSchema = z
  .object({
    analytics: weeklyAnalyticsSchema,
    stored: storedReviewSchema.nullable(),
  })
  .passthrough();

export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;
