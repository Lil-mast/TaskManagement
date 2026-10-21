import { z } from 'zod';

import { idSchema, isoDateSchema, isoDateTimeSchema } from './common';

export const briefPrioritySchema = z
  .object({
    task_id: idSchema,
    title: z.string(),
    why: z.string(),
  })
  .passthrough();

export const briefWatchItemSchema = z
  .object({
    title: z.string(),
    permalink: z.string(),
    verdict: z.string(),
  })
  .passthrough();

export const briefLeetCodeSchema = z
  .object({
    pattern: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .passthrough();

export const briefPayloadSchema = z
  .object({
    headline: z.string(),
    priorities: z.array(briefPrioritySchema),
    watchlist: z.array(briefWatchItemSchema),
    leetcode: briefLeetCodeSchema,
    principles_used: z.array(z.string()),
    compose_log: z.string().nullable().optional(),
  })
  .passthrough();

export type BriefPayload = z.infer<typeof briefPayloadSchema>;

export const storedBriefSchema = z
  .object({
    id: idSchema,
    user_id: z.string(),
    brief_date: isoDateSchema,
    payload: briefPayloadSchema,
    model: z.string(),
    created_at: isoDateTimeSchema,
  })
  .passthrough();

export type StoredBrief = z.infer<typeof storedBriefSchema>;

export const briefRefreshResponseSchema = z
  .object({
    refreshed: z.boolean(),
    brief: briefPayloadSchema,
  })
  .passthrough();

export type BriefRefreshResponse = z.infer<typeof briefRefreshResponseSchema>;

export const briefAcceptResponseSchema = z
  .object({ accepted: idSchema })
  .passthrough();

export interface BriefAcceptInput {
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  source?: string;
}
