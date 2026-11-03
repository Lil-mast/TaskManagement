import { apiFetch } from '../client';
import { parseWire } from '../parse';
import {
  debriefResultSchema,
  runResultSchema,
  type DebriefRequest,
  type DebriefResult,
  type RunRequest,
  type RunResult,
} from '../schemas/workspace';

const BASE = '/api/workspace';

export const workspaceApi = {
  /**
   * Execute code in the Docker sandbox.
   * Returns stdout, stderr, exit code, and timing — plus a submission_id
   * to reference when calling `debrief`.
   */
  async run(input: RunRequest, signal?: AbortSignal): Promise<RunResult> {
    const payload = await apiFetch<unknown>(
      `${BASE}/run`,
      { method: 'POST', body: input, signal },
    );
    return parseWire(runResultSchema, payload, `${BASE}/run`);
  },

  /**
   * Ask MrT for a post-solve debrief.
   * Returns a motivational message (hype or mentor tone), matched
   * Pragmatic Programmer tip, and the tone used.
   */
  async debrief(input: DebriefRequest, signal?: AbortSignal): Promise<DebriefResult> {
    const payload = await apiFetch<unknown>(
      `${BASE}/debrief`,
      { method: 'POST', body: input, signal },
    );
    return parseWire(debriefResultSchema, payload, `${BASE}/debrief`);
  },
};
