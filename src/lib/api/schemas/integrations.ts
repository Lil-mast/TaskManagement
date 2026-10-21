import { z } from 'zod';

import { isoDateTimeSchema } from './common';

export const watchItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    permalink: z.string(),
    source: z.string().nullable().optional(),
    pub_time: isoDateTimeSchema.nullable().optional(),
    read_time: z.number().int().nullable().optional(),
    num_upvotes: z.number().int().default(0),
    num_comments: z.number().int().default(0),
  })
  .passthrough();

export type WatchItem = z.infer<typeof watchItemSchema>;

export const dailyDevFeedsSchema = z
  .object({
    for_you: z.array(watchItemSchema),
    discussed: z.array(watchItemSchema),
    fetched_at: isoDateTimeSchema.nullable(),
    from_cache: z.boolean(),
  })
  .passthrough();

export type DailyDevFeeds = z.infer<typeof dailyDevFeedsSchema>;

export const integrationProviderSchema = z
  .object({
    connected: z.boolean(),
    connected_at: isoDateTimeSchema,
    scopes: z.array(z.string()),
  })
  .passthrough();

export const integrationsStatusSchema = z
  .object({
    providers: z.record(integrationProviderSchema),
    calendar_events_cached: z.number().int(),
    clients_configured: z
      .object({
        google: z.boolean(),
        gmail: z.boolean(),
        dailydev: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

export type IntegrationsStatus = z.infer<typeof integrationsStatusSchema>;

export const consentUrlSchema = z.object({ url: z.string().url() }).passthrough();

export const disconnectResponseSchema = z
  .object({ disconnected: z.number().int() })
  .passthrough();
