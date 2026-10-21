import { z } from 'zod';

import { apiFetch } from '../client';
import { parseWire } from '../parse';
import {
  attemptResultSchema,
  leetCodeAttemptSchema,
  leetCodePatternSchema,
  patternStatSchema,
  type AttemptResult,
  type LeetCodeAttempt,
  type LeetCodePattern,
  type LogAttemptInput,
  type PatternStat,
  type PatternUpsertInput,
} from '../schemas/leetcode';

const LEETCODE = '/api/leetcode';
const patterns = `${LEETCODE}/patterns`;
const attempts = `${LEETCODE}/attempts`;

export const leetCodeApi = {
  async listPatterns(signal?: AbortSignal): Promise<LeetCodePattern[]> {
    const payload = await apiFetch<unknown>(patterns, { signal });
    return parseWire(z.array(leetCodePatternSchema), payload, patterns);
  },

  async upsertPattern(input: PatternUpsertInput): Promise<LeetCodePattern> {
    const payload = await apiFetch<unknown>(patterns, { method: 'POST', body: input });
    return parseWire(leetCodePatternSchema, payload, patterns);
  },

  async deletePattern(id: string): Promise<boolean> {
    const path = `${patterns}/${encodeURIComponent(id)}/delete`;
    const payload = await apiFetch<unknown>(path, { method: 'POST' });
    return parseWire(z.object({ deleted: z.boolean() }).passthrough(), payload, path).deleted;
  },

  async listAttempts(limit = 30, signal?: AbortSignal): Promise<LeetCodeAttempt[]> {
    const payload = await apiFetch<unknown>(attempts, { query: { limit }, signal });
    return parseWire(z.array(leetCodeAttemptSchema), payload, attempts);
  },

  async logAttempt(input: LogAttemptInput): Promise<AttemptResult> {
    const payload = await apiFetch<unknown>(attempts, { method: 'POST', body: input });
    return parseWire(attemptResultSchema, payload, attempts);
  },

  async stats(signal?: AbortSignal): Promise<PatternStat[]> {
    const path = `${LEETCODE}/stats`;
    const payload = await apiFetch<unknown>(path, { signal });
    return parseWire(z.array(patternStatSchema), payload, path);
  },
};
