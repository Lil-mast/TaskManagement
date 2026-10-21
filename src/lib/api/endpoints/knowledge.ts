import { z } from 'zod';

import { apiFetch } from '../client';
import { TIMEOUTS } from '../config';
import { parseWire } from '../parse';
import {
  ingestSummarySchema,
  knowledgeHitSchema,
  knowledgeItemSchema,
  knowledgeWeightsSchema,
  type IngestSummary,
  type KnowledgeHit,
  type KnowledgeIngestItem,
  type KnowledgeItem,
  type KnowledgeWeights,
} from '../schemas/knowledge';

const KNOWLEDGE = '/api/knowledge';

export const knowledgeApi = {
  async ingest(items?: KnowledgeIngestItem[], signal?: AbortSignal): Promise<IngestSummary> {
    const path = `${KNOWLEDGE}/ingest`;
    const payload = await apiFetch<unknown>(path, {
      method: 'POST',
      body: items && items.length > 0 ? { items } : {},
      signal,
      timeoutMs: TIMEOUTS.sync,
    });
    return parseWire(ingestSummarySchema, payload, path);
  },

  async items(signal?: AbortSignal): Promise<KnowledgeItem[]> {
    const path = `${KNOWLEDGE}/items`;
    const payload = await apiFetch<unknown>(path, { signal });
    return parseWire(z.array(knowledgeItemSchema), payload, path);
  },

  async search(query: string, k = 6, signal?: AbortSignal): Promise<KnowledgeHit[]> {
    const path = `${KNOWLEDGE}/search`;
    const payload = await apiFetch<unknown>(path, {
      method: 'POST',
      body: { query, k },
      signal,
      timeoutMs: TIMEOUTS.sync,
    });
    return parseWire(z.array(knowledgeHitSchema), payload, path);
  },

  async feedback(itemId: string): Promise<boolean> {
    const path = `${KNOWLEDGE}/feedback`;
    const payload = await apiFetch<unknown>(path, {
      method: 'POST',
      body: { item_id: itemId },
    });
    return parseWire(z.object({ ok: z.boolean() }).passthrough(), payload, path).ok;
  },

  async weights(signal?: AbortSignal): Promise<KnowledgeWeights> {
    const path = `${KNOWLEDGE}/weights`;
    const payload = await apiFetch<unknown>(path, { signal });
    return parseWire(knowledgeWeightsSchema, payload, path);
  },
};
