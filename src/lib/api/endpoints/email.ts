import { z } from 'zod';

import { apiFetch } from '../client';
import { TIMEOUTS } from '../config';
import { parseWire } from '../parse';
import {
  triageActResponseSchema,
  triageRowSchema,
  triageRunSchema,
  type TriageAction,
  type TriageRow,
  type TriageRun,
  type TriageState,
} from '../schemas/email';

const TRIAGE = '/api/email/triage';

export const emailApi = {
  /** Runs Gmail fetch + classification (≤15 unseen threads). */
  async runTriage(signal?: AbortSignal): Promise<TriageRun> {
    const payload = await apiFetch<unknown>(TRIAGE, {
      method: 'POST',
      signal,
      timeoutMs: TIMEOUTS.sync,
    });
    return parseWire(triageRunSchema, payload, TRIAGE);
  },

  async list(state: TriageState = 'open', signal?: AbortSignal): Promise<TriageRow[]> {
    const payload = await apiFetch<unknown>(TRIAGE, { query: { state }, signal });
    return parseWire(z.array(triageRowSchema), payload, `${TRIAGE}?state=${state}`);
  },

  async act(msgId: string, action: TriageAction): Promise<unknown> {
    const path = `${TRIAGE}/${encodeURIComponent(msgId)}/act`;
    const payload = await apiFetch<unknown>(path, { method: 'POST', body: action });
    return parseWire(triageActResponseSchema, payload, path).acted;
  },
};
