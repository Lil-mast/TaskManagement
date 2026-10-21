import { z } from 'zod';

import { apiFetch } from '../client';
import { TIMEOUTS } from '../config';
import { parseWire } from '../parse';
import {
  calendarEventSchema,
  calendarPlanSchema,
  calendarSyncResponseSchema,
  type CalendarEvent,
  type CalendarPlan,
} from '../schemas/calendar';

const CALENDAR = '/api/calendar';
const events = `${CALENDAR}/events`;

export const calendarApi = {
  async sync(signal?: AbortSignal): Promise<number> {
    const payload = await apiFetch<unknown>(`${CALENDAR}/sync`, {
      method: 'POST',
      signal,
      timeoutMs: TIMEOUTS.sync,
    });
    return parseWire(calendarSyncResponseSchema, payload, `${CALENDAR}/sync`).synced_events;
  },

  async listEvents(days = 7, fresh = false, signal?: AbortSignal): Promise<CalendarEvent[]> {
    const payload = await apiFetch<unknown>(events, { query: { days, fresh }, signal });
    return parseWire(z.array(calendarEventSchema), payload, events);
  },

  async plan(signal?: AbortSignal): Promise<CalendarPlan> {
    const path = `${CALENDAR}/plan`;
    const payload = await apiFetch<unknown>(path, { signal, timeoutMs: TIMEOUTS.sync });
    return parseWire(calendarPlanSchema, payload, path);
  },
};
