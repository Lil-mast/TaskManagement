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

export const challengeExampleSchema = z
  .object({
    input: z.string(),
    output: z.string(),
    explanation: z.string().nullable().optional(),
  })
  .passthrough();

export const dailyChallengeSchema = z
  .object({
    title: z.string(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    pattern: z.string(),
    time_limit_min: z.number().int().min(1).max(120),
    prompt: z.string(),
    examples: z.array(challengeExampleSchema).default([]),
    constraints: z.array(z.string()).default([]),
    hints: z.array(z.string()).default([]),
    approach: z.string(),
    complexity: z.string(),
    code: z.string(),
    language: z.string(),
  })
  .passthrough();

export type DailyChallenge = z.infer<typeof dailyChallengeSchema>;
export type ChallengeExample = z.infer<typeof challengeExampleSchema>;

export const briefLeetCodeSchema = z
  .object({
    pattern: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    challenge: dailyChallengeSchema.nullable().optional(),
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
