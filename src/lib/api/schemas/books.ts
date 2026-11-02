import { z } from 'zod';

export const bookIdeaItemSchema = z.object({
  book: z.string(),
  chapter: z.string().nullable().optional(),
  idea: z.string(),
  application: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
});

export const dailyInspirationSchema = bookIdeaItemSchema.extend({
  alternatives: z.array(bookIdeaItemSchema).default([]),
});

export type BookIdeaItem = z.infer<typeof bookIdeaItemSchema>;
export type DailyInspiration = z.infer<typeof dailyInspirationSchema>;
