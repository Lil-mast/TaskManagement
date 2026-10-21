import type { TriageState } from '@/lib/api/schemas/email';
import type { TaskStatus } from '@/lib/api/schemas/common';

/**
 * Query keys are the cache contract. Keep them here so invalidation cannot
 * drift from the queries it is meant to refresh.
 */
export const queryKeys = {
  health: ['health'] as const,

  tasks: {
    all: ['tasks'] as const,
    list: (status: TaskStatus) => ['tasks', status] as const,
  },

  brief: {
    all: ['brief'] as const,
    today: ['brief', 'today'] as const,
    byDate: (date: string) => ['brief', date] as const,
  },

  leetcode: {
    all: ['leetcode'] as const,
    patterns: ['leetcode', 'patterns'] as const,
    attempts: (limit: number) => ['leetcode', 'attempts', limit] as const,
    stats: ['leetcode', 'stats'] as const,
  },

  email: {
    all: ['email'] as const,
    list: (state: TriageState) => ['email', 'triage', state] as const,
  },

  calendar: {
    all: ['calendar'] as const,
    events: (days: number) => ['calendar', 'events', days] as const,
    plan: ['calendar', 'plan'] as const,
  },

  review: {
    all: ['review'] as const,
    week: (week: string) => ['review', week] as const,
  },

  profile: ['profile'] as const,
  onboarding: ['onboarding'] as const,
  integrations: ['integrations'] as const,
  dailyDev: ['integrations', 'dailydev'] as const,

  knowledge: {
    all: ['knowledge'] as const,
    items: ['knowledge', 'items'] as const,
    weights: ['knowledge', 'weights'] as const,
    search: (query: string, k: number) => ['knowledge', 'search', query, k] as const,
  },
} as const;

/** Exact keys to invalidate after a confirmed mutation. */
export const invalidation = {
  afterTaskWrite: [queryKeys.tasks.all, queryKeys.brief.all],
  afterBriefWrite: [queryKeys.brief.all, queryKeys.tasks.all],
  afterTriageWrite: [queryKeys.email.all, queryKeys.tasks.all, queryKeys.brief.all],
  afterCalendarSync: [queryKeys.calendar.all],
  afterProfileWrite: [queryKeys.profile, queryKeys.onboarding, queryKeys.brief.all],
  afterIntegrationChange: [queryKeys.integrations, queryKeys.dailyDev, queryKeys.onboarding],
  afterLeetCodeWrite: [queryKeys.leetcode.all, queryKeys.tasks.all, queryKeys.brief.all],
  afterKnowledgeWrite: [queryKeys.knowledge.all],
} as const;
