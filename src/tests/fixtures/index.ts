export const taskFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'user_fixture',
  title: 'Finish the metrics report draft',
  description: null,
  priority: 'now',
  status: 'open',
  due_date: '2026-10-24',
  completed_at: null,
  source: 'nl_capture',
  meta: { confidence: 'high' },
  tags: ['work', 'writing'],
  created_at: '2026-10-21T07:04:00+00:00',
};

export const briefFixture = {
  id: '22222222-2222-4222-8222-222222222222',
  user_id: 'user_fixture',
  brief_date: '2026-10-21',
  payload: {
    headline: 'Two deep-work blocks, one drill, three inbox decisions.',
    priorities: [
      {
        task_id: '11111111-1111-4111-8111-111111111111',
        title: 'Finish the metrics report draft',
        why: 'Due Friday; the 14:00 gap is still open.',
      },
    ],
    watchlist: [
      {
        title: 'Speculative decoding architectures',
        permalink: 'https://example.test/article',
        verdict: 'Worth 8 minutes; relevant to the inference migration.',
      },
    ],
    leetcode: {
      pattern: 'Dynamic Programming',
      note: 'Track the state you reuse.',
      challenge: {
        title: 'The Reusable State',
        difficulty: 'medium',
        pattern: 'Dynamic Programming',
        time_limit_min: 25,
        prompt: 'Find the best value by reusing a smaller state.',
        examples: [{ input: 'values = [1, 2, 3]', output: '6' }],
        constraints: ['1 <= values.length <= 1000'],
        hints: ['Name the state first.', 'Decide what each state depends on.'],
        approach: 'Define the state, initialise the base cases, and fill in order.',
        complexity: 'O(n) time and O(n) space.',
        code: 'function solve(values: number[]): number { return values.length; }',
        language: 'TypeScript',
      },
    },
    principles_used: ['high_output_management#leverage'],
    compose_log: null,
  },
  model: 'claude-sonnet-5-5',
  created_at: '2026-10-21T07:00:00+00:00',
};

export const captureFixture = {
  tasks: [
    {
      title: 'Call the dentist',
      description: 'Book the follow-up cleaning.',
      priority: 'now',
      due_date: '2026-10-22',
      tags: ['errand'],
      confidence: 'high',
    },
  ],
  saved_to_db: null,
};

export const attemptResultFixture = {
  attempt: {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: 'user_fixture',
    problem_url: 'https://leetcode.test/problems/lis',
    problem_title: 'Longest Increasing Subsequence',
    difficulty: 'medium',
    pattern_id: '44444444-4444-4444-8444-444444444444',
    time_taken_min: 25,
    needed_help: false,
    notes: null,
    attempted_at: '2026-10-21T09:30:00+00:00',
  },
  reschedule: { next_review: '2026-10-29', interval_days: 8, ease: 2.6 },
  review_task_id: '55555555-5555-4555-8555-555555555555',
  review_due: '2026-10-29',
};

export const triageRowFixture = {
  gmail_msg_id: 'msg_fixture_001',
  user_id: 'user_fixture',
  category: 'reply',
  summary: 'Sign-off requested for the failover simulation.',
  subject: 'Prod DB replica failover',
  state: 'open',
  suggested_task_id: null,
  triaged_at: '2026-10-21T08:14:00+00:00',
};

export const calendarPlanFixture = {
  window: {
    from: '2026-10-21T07:00:00+00:00',
    to: '2026-10-28T07:00:00+00:00',
    days: 7,
  },
  meeting_minutes: 285,
  gaps: [
    {
      start: '2026-10-21T14:00:00+00:00',
      end: '2026-10-21T16:00:00+00:00',
      minutes: 120,
    },
  ],
  suggestions: [
    {
      task_id: '11111111-1111-4111-8111-111111111111',
      title: 'Rust ownership notes',
      suggested_start: '2026-10-21T14:00:00+00:00',
      duration_minutes: 120,
      why: 'First 2h gap with no meeting conflict.',
    },
  ],
  note: 'proposals only — nothing is scheduled without your explicit accept',
};

export const weeklyReviewFixture = {
  analytics: {
    week_start: '2026-10-19',
    week_end: '2026-10-26',
    tasks: {
      completed: 14,
      completed_by_priority: [
        { priority: 'now', n: 8 },
        { priority: 'schedule', n: 4 },
        { priority: 'delegate', n: 2 },
      ],
      completed_prev_week: 11,
      created: 18,
      carried_over: 4,
      overdue: 2,
    },
    leetcode: {
      attempts: 7,
      no_help_rate: 0.71,
      attempts_prev: 5,
      no_help_rate_prev: 0.6,
      patterns_due: 3,
    },
    inbox: { open_reply: 3, open_task: 2, acted_total: 9 },
    principles: [
      {
        book: 'High Output Management',
        accepted_total: 5,
        surfaced_this_week: 12,
        quarantined: 0,
      },
    ],
  },
  stored: null,
};

export const profileFixture = {
  user_id: 'user_fixture',
  name: 'Christian Tazma',
  target_interview_date: '2026-12-01',
  focus_areas: ['rust', 'system design'],
};

export const onboardingFixture = {
  seeded_tasks: true,
  daily_dev_connected: true,
  google_connected: false,
  knowledge_ingested: true,
  llm_ready: true,
  next_steps: ['GET /api/integrations/google/url — connect Google Calendar'],
};

export const integrationsFixture = {
  providers: {
    google: {
      connected: true,
      connected_at: '2026-10-20T10:00:00+00:00',
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    },
  },
  calendar_events_cached: 7,
  clients_configured: { google: true, gmail: true, dailydev: true },
};

export const dailyDevFixture = {
  for_you: [
    {
      id: 'feed_1',
      title: 'Speculative decoding architectures',
      permalink: 'https://example.test/article',
      source: 'daily.dev',
      pub_time: '2026-10-21T06:00:00+00:00',
      read_time: 8,
      num_upvotes: 42,
      num_comments: 6,
    },
  ],
  discussed: [],
  fetched_at: '2026-10-21T07:00:00+00:00',
  from_cache: true,
};

export const knowledgeWeightsFixture = {
  items: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      book: 'High Output Management',
      idea: 'The output of a manager is the output of the organisation.',
      weight: 1,
      effective_weight: 1.42,
      accepted_count: 5,
      conflicts: 1,
      surfaced_30d: 12,
    },
  ],
  quarantined: 0,
  note: 'quarantine = effective_weight ≤ 0.1 — deprioritized, never deleted',
};

export const healthFixture = {
  ok: true,
  version: '0.1.0',
  database: 'configured',
  anthropic: 'configured',
  auth_mode: 'dev',
  llm_tokens_available: 125000,
};
