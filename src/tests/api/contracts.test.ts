import { describe, expect, it } from 'vitest';

import { captureResponseSchema } from '@/lib/api/schemas/capture';
import { healthSchema } from '@/lib/api/schemas/health';
import { storedBriefSchema, briefRefreshResponseSchema } from '@/lib/api/schemas/briefing';
import { attemptResultSchema } from '@/lib/api/schemas/leetcode';
import { triageRowSchema, triageRunSchema } from '@/lib/api/schemas/email';
import { calendarEventSchema, calendarPlanSchema } from '@/lib/api/schemas/calendar';
import { weeklyReviewSchema } from '@/lib/api/schemas/review';
import { profileSchema } from '@/lib/api/schemas/profile';
import { onboardingStatusSchema } from '@/lib/api/schemas/onboarding';
import {
  dailyDevFeedsSchema,
  integrationsStatusSchema,
} from '@/lib/api/schemas/integrations';
import { knowledgeWeightsSchema } from '@/lib/api/schemas/knowledge';
import { taskSchema } from '@/lib/api/schemas/common';
import {
  attemptResultFixture,
  briefFixture,
  calendarPlanFixture,
  captureFixture,
  dailyDevFixture,
  healthFixture,
  integrationsFixture,
  knowledgeWeightsFixture,
  onboardingFixture,
  profileFixture,
  taskFixture,
  triageRowFixture,
  weeklyReviewFixture,
} from '../fixtures';

describe('wire contracts', () => {
  it('parses a task and normalises nullable tags', () => {
    const task = taskSchema.parse({ ...taskFixture, tags: null });
    expect(task.tags).toEqual([]);
    expect(task.priority).toBe('now');
  });

  it('parses health', () => {
    expect(healthSchema.parse(healthFixture).auth_mode).toBe('dev');
  });

  it('parses a stored brief and a refresh response', () => {
    const brief = storedBriefSchema.parse(briefFixture);
    expect(brief.payload.priorities).toHaveLength(1);
    expect(brief.payload.leetcode.challenge?.time_limit_min).toBe(25);
    expect(
      briefRefreshResponseSchema.parse({ refreshed: true, brief: briefFixture.payload }).brief.headline,
    ).toContain('deep-work');
  });

  it('parses capture proposals', () => {
    expect(captureResponseSchema.parse(captureFixture).tasks[0]?.confidence).toBe('high');
  });

  it('parses a LeetCode attempt result', () => {
    expect(attemptResultSchema.parse(attemptResultFixture).reschedule.interval_days).toBe(8);
  });

  it('parses triage rows and a triage run', () => {
    expect(triageRowSchema.parse(triageRowFixture).category).toBe('reply');
    expect(
      triageRunSchema.parse({ stored: 1, open: [triageRowFixture] }).open,
    ).toHaveLength(1);
  });

  it('parses calendar events and the plan', () => {
    expect(
      calendarEventSchema.parse({
        event_id: 'evt_1',
        title: 'Architecture review',
        start_at: '2026-10-21T10:00:00+00:00',
        end_at: '2026-10-21T10:45:00+00:00',
        busy: true,
      }).busy,
    ).toBe(true);
    expect(calendarPlanSchema.parse(calendarPlanFixture).gaps[0]?.minutes).toBe(120);
  });

  it('parses weekly analytics with a null stored review', () => {
    expect(weeklyReviewSchema.parse(weeklyReviewFixture).analytics.tasks.completed).toBe(14);
  });

  it('parses profile and onboarding', () => {
    expect(profileSchema.parse(profileFixture).focus_areas).toEqual(['rust', 'system design']);
    expect(onboardingStatusSchema.parse(onboardingFixture).llm_ready).toBe(true);
  });

  it('parses integrations and daily.dev feeds', () => {
    expect(integrationsStatusSchema.parse(integrationsFixture).providers.google?.connected).toBe(true);
    expect(dailyDevFeedsSchema.parse(dailyDevFixture).for_you[0]?.num_upvotes).toBe(42);
  });

  it('parses knowledge weights', () => {
    expect(knowledgeWeightsSchema.parse(knowledgeWeightsFixture).items[0]?.effective_weight).toBe(1.42);
  });

  it('rejects an unknown priority instead of rendering it', () => {
    expect(() => taskSchema.parse({ ...taskFixture, priority: 'urgent_important' })).toThrow();
  });
});
