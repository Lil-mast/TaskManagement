import { z } from 'zod';

import { idSchema, isoDateTimeSchema } from './common';

export const calendarEventSchema = z
  .object({
    event_id: z.string(),
    title: z.string(),
    start_at: isoDateTimeSchema,
    end_at: isoDateTimeSchema,
    busy: z.boolean(),
  })
  .passthrough();

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarSyncResponseSchema = z
  .object({ synced_events: z.number().int() })
  .passthrough();

export const calendarGapSchema = z
  .object({
    start: isoDateTimeSchema,
    end: isoDateTimeSchema,
    minutes: z.number().int(),
  })
  .passthrough();

export type CalendarGap = z.infer<typeof calendarGapSchema>;

export const calendarSuggestionSchema = z
  .object({
    task_id: idSchema,
    title: z.string(),
    suggested_start: isoDateTimeSchema,
    duration_minutes: z.number().int(),
    why: z.string(),
  })
  .passthrough();

export type CalendarSuggestion = z.infer<typeof calendarSuggestionSchema>;

export const calendarPlanSchema = z
  .object({
    window: z
      .object({
        from: isoDateTimeSchema,
        to: isoDateTimeSchema,
        days: z.number().int(),
      })
      .passthrough(),
    meeting_minutes: z.number().int(),
    gaps: z.array(calendarGapSchema),
    suggestions: z.array(calendarSuggestionSchema),
    note: z.string(),
  })
  .passthrough();

export type CalendarPlan = z.infer<typeof calendarPlanSchema>;
