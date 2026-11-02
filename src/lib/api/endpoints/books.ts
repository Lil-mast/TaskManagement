import { apiFetch } from '../client';
import { parseWire } from '../parse';
import { dailyInspirationSchema, type DailyInspiration } from '../schemas/books';

export const booksApi = {
  async getDailyInspiration(signal?: AbortSignal): Promise<DailyInspiration> {
    const payload = await apiFetch<unknown>('/api/books/daily-inspiration', {
      auth: false,
      signal,
    });
    return parseWire(dailyInspirationSchema, payload, '/api/books/daily-inspiration');
  },
};
