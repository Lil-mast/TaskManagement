import { apiFetch } from '../client';
import { parseWire } from '../parse';
import {
  onboardingSeedSchema,
  onboardingStatusSchema,
  type OnboardingSeedResult,
  type OnboardingStatus,
} from '../schemas/onboarding';

const ONBOARDING = '/api/onboarding';

export const onboardingApi = {
  async status(signal?: AbortSignal): Promise<OnboardingStatus> {
    const payload = await apiFetch<unknown>(ONBOARDING, { signal });
    return parseWire(onboardingStatusSchema, payload, ONBOARDING);
  },

  async seed(): Promise<OnboardingSeedResult> {
    const path = `${ONBOARDING}/seed`;
    const payload = await apiFetch<unknown>(path, { method: 'POST' });
    return parseWire(onboardingSeedSchema, payload, path);
  },
};
