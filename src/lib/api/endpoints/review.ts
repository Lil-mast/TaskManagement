import { apiFetch } from '../client';
import { parseWire } from '../parse';
import {
  storedReviewSchema,
  weeklyReviewSchema,
  type StoredReview,
  type WeeklyReview,
} from '../schemas/review';

const REVIEW = '/api/review/weekly';

export const reviewApi = {
  async weekly(week?: string, signal?: AbortSignal): Promise<WeeklyReview> {
    const payload = await apiFetch<unknown>(REVIEW, { query: { week }, signal });
    return parseWire(weeklyReviewSchema, payload, REVIEW);
  },

  async run(): Promise<StoredReview> {
    const path = `${REVIEW}/run`;
    const payload = await apiFetch<unknown>(path, { method: 'POST' });
    return parseWire(storedReviewSchema, payload, path);
  },
};
