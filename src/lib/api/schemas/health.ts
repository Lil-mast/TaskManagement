import { z } from 'zod';

export const healthSchema = z
  .object({
    ok: z.boolean(),
    version: z.string(),
    database: z.enum(['configured', 'not-configured']),
    anthropic: z.enum(['configured', 'unconfigured', 'not-configured']),
    auth_mode: z.enum(['firebase', 'supabase', 'dev', 'unconfigured']),
    llm_tokens_available: z.number().nullable().optional(),
  })
  .passthrough();

export type Health = z.infer<typeof healthSchema>;
