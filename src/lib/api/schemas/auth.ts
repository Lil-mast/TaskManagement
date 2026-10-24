import { z } from 'zod';

export const authModeSchema = z.enum(['firebase', 'supabase', 'dev', 'unconfigured']);

export const authMeSchema = z
  .object({
    user_id: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    email_verified: z.boolean(),
    is_admin: z.boolean(),
    allowed: z.boolean(),
    reason: z.enum(['email_unverified', 'not_invited']).nullable().optional(),
    auth_mode: authModeSchema,
  })
  .passthrough();

export type AuthMe = z.infer<typeof authMeSchema>;
