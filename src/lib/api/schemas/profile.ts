import { z } from 'zod';

import { isoDateSchema } from './common';

export const profileSchema = z
  .object({
    user_id: z.string(),
    name: z.string().nullable(),
    target_interview_date: isoDateSchema.nullable(),
    focus_areas: z.array(z.string()),
  })
  .passthrough();

export type Profile = z.infer<typeof profileSchema>;

export interface ProfileInput {
  name?: string | null;
  target_interview_date?: string | null;
  focus_areas: string[];
}
