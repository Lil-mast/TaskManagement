import { apiFetch } from '../client';
import { parseWire } from '../parse';
import {
  consentUrlSchema,
  dailyDevFeedsSchema,
  disconnectResponseSchema,
  integrationsStatusSchema,
  type DailyDevFeeds,
  type IntegrationsStatus,
} from '../schemas/integrations';

const INTEGRATIONS = '/api/integrations';
const DAILYDEV = `${INTEGRATIONS}/dailydev/feeds`;

export const integrationsApi = {
  async status(signal?: AbortSignal): Promise<IntegrationsStatus> {
    const payload = await apiFetch<unknown>(INTEGRATIONS, { signal });
    return parseWire(integrationsStatusSchema, payload, INTEGRATIONS);
  },

  async dailyDevFeeds(signal?: AbortSignal): Promise<DailyDevFeeds> {
    const payload = await apiFetch<unknown>(DAILYDEV, { signal });
    return parseWire(dailyDevFeedsSchema, payload, DAILYDEV);
  },

  async refreshDailyDev(): Promise<DailyDevFeeds> {
    const payload = await apiFetch<unknown>(DAILYDEV, { method: 'POST' });
    return parseWire(dailyDevFeedsSchema, payload, DAILYDEV);
  },

  async googleConsentUrl(): Promise<string> {
    const path = `${INTEGRATIONS}/google/url`;
    const payload = await apiFetch<unknown>(path);
    return parseWire(consentUrlSchema, payload, path).url;
  },

  async gmailConsentUrl(): Promise<string> {
    const path = `${INTEGRATIONS}/gmail/url`;
    const payload = await apiFetch<unknown>(path);
    return parseWire(consentUrlSchema, payload, path).url;
  },

  async disconnectGoogle(): Promise<number> {
    const payload = await apiFetch<unknown>(`${INTEGRATIONS}/google`, { method: 'DELETE' });
    return parseWire(disconnectResponseSchema, payload, `${INTEGRATIONS}/google`).disconnected;
  },

  async disconnectGmail(): Promise<number> {
    const payload = await apiFetch<unknown>(`${INTEGRATIONS}/gmail`, { method: 'DELETE' });
    return parseWire(disconnectResponseSchema, payload, `${INTEGRATIONS}/gmail`).disconnected;
  },
};
