import { apiFetch } from '../client';
import { TIMEOUTS } from '../config';
import { parseWire } from '../parse';
import {
  briefAcceptResponseSchema,
  briefRefreshResponseSchema,
  storedBriefSchema,
  type BriefAcceptInput,
  type BriefRefreshResponse,
  type StoredBrief,
} from '../schemas/briefing';

const BRIEFING = '/api/briefing';

export const briefingApi = {
  async today(signal?: AbortSignal): Promise<StoredBrief> {
    const payload = await apiFetch<unknown>(BRIEFING, { signal, timeoutMs: TIMEOUTS.agent });
    return parseWire(storedBriefSchema, payload, BRIEFING);
  },

  async refresh(signal?: AbortSignal): Promise<BriefRefreshResponse> {
    const payload = await apiFetch<unknown>(`${BRIEFING}/refresh`, {
      method: 'POST',
      signal,
      timeoutMs: TIMEOUTS.agent,
    });
    return parseWire(briefRefreshResponseSchema, payload, `${BRIEFING}/refresh`);
  },

  async accept(input: BriefAcceptInput): Promise<string> {
    const payload = await apiFetch<unknown>(`${BRIEFING}/accept`, {
      method: 'POST',
      body: input,
    });
    return parseWire(briefAcceptResponseSchema, payload, `${BRIEFING}/accept`).accepted;
  },
};
