import { apiFetch } from '../client';
import { TIMEOUTS } from '../config';
import { parseWire } from '../parse';
import { captureResponseSchema, type CaptureInput, type CaptureResponse } from '../schemas/capture';

const CAPTURE = '/api/capture';

export const captureApi = {
  async create(input: CaptureInput, signal?: AbortSignal): Promise<CaptureResponse> {
    const payload = await apiFetch<unknown>(CAPTURE, {
      method: 'POST',
      body: { text: input.text, persist: input.persist ?? false },
      signal,
      timeoutMs: TIMEOUTS.agent,
    });
    return parseWire(captureResponseSchema, payload, CAPTURE);
  },
};
