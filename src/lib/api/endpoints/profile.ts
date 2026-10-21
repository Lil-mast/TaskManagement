import { apiFetch } from '../client';
import { parseWire } from '../parse';
import { profileSchema, type Profile, type ProfileInput } from '../schemas/profile';

const PROFILE = '/api/profile';

export const profileApi = {
  async get(signal?: AbortSignal): Promise<Profile> {
    const payload = await apiFetch<unknown>(PROFILE, { signal });
    return parseWire(profileSchema, payload, PROFILE);
  },

  async update(input: ProfileInput): Promise<Profile> {
    const payload = await apiFetch<unknown>(PROFILE, { method: 'PUT', body: input });
    return parseWire(profileSchema, payload, PROFILE);
  },
};
