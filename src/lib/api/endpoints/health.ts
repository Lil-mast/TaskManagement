import { apiFetch } from '../client';
import { parseWire } from '../parse';
import { healthSchema, type Health } from '../schemas/health';

export const healthApi = {
  async get(signal?: AbortSignal): Promise<Health> {
    const payload = await apiFetch<unknown>('/healthz', { auth: false, signal });
    return parseWire(healthSchema, payload, '/healthz');
  },
};
