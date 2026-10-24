import { apiFetch } from '../client';
import { parseWire } from '../parse';
import { authMeSchema, type AuthMe } from '../schemas/auth';

const ME = '/api/auth/me';

export const authApi = {
  async me(signal?: AbortSignal): Promise<AuthMe> {
    const payload = await apiFetch<unknown>(ME, { signal });
    return parseWire(authMeSchema, payload, ME);
  },
};
