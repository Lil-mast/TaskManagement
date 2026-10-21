import { z } from 'zod';

export const onboardingStatusSchema = z
  .object({
    seeded_tasks: z.boolean(),
    daily_dev_connected: z.boolean(),
    google_connected: z.boolean(),
    knowledge_ingested: z.boolean(),
    llm_ready: z.boolean(),
    next_steps: z.array(z.string()),
  })
  .passthrough();

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const onboardingSeedSchema = z
  .object({
    inserted: z.number().int(),
    matrix_was_empty: z.boolean(),
  })
  .passthrough();

export type OnboardingSeedResult = z.infer<typeof onboardingSeedSchema>;
