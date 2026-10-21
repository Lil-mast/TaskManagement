import { z } from 'zod';

import { idSchema } from './common';

export const knowledgeItemSchema = z
  .object({
    id: idSchema,
    book: z.string(),
    chapter: z.string().nullable().optional(),
    idea: z.string(),
    weight: z.number(),
    accepted_count: z.number().int(),
  })
  .passthrough();

export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;

export const knowledgeHitSchema = z
  .object({
    id: idSchema,
    content: z.string(),
    source_ref: z.string(),
    score: z.number(),
  })
  .passthrough();

export type KnowledgeHit = z.infer<typeof knowledgeHitSchema>;

export const ingestSummarySchema = z
  .object({
    items_received: z.number().int(),
    items_new: z.number().int(),
    chunks_embedded: z.number().int(),
    chunks_skipped: z.number().int(),
  })
  .passthrough();

export type IngestSummary = z.infer<typeof ingestSummarySchema>;

export const knowledgeWeightSchema = z
  .object({
    id: idSchema,
    book: z.string(),
    idea: z.string(),
    weight: z.number(),
    effective_weight: z.number(),
    accepted_count: z.number().int(),
    conflicts: z.number().int(),
    surfaced_30d: z.number().int(),
  })
  .passthrough();

export type KnowledgeWeight = z.infer<typeof knowledgeWeightSchema>;

export const knowledgeWeightsSchema = z
  .object({
    items: z.array(knowledgeWeightSchema),
    quarantined: z.number().int(),
    note: z.string(),
  })
  .passthrough();

export type KnowledgeWeights = z.infer<typeof knowledgeWeightsSchema>;

export interface KnowledgeIngestItem {
  book: string;
  chapter?: string;
  idea: string;
  application?: string;
  tags?: string[];
  weight?: number;
}
