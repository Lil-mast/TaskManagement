import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { Wordmark } from '@/components/Wordmark';
import {
  briefingApi,
  integrationsApi,
  onboardingApi,
  profileApi,
  tasksApi,
} from '@/lib/api';
import { useSession } from '@/lib/auth/session';
import { markOnboardingComplete } from '@/lib/onboarding';
import { invalidation, queryKeys } from '@/lib/query/keys';
import { describeApiError } from '@/lib/task-ui';

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Identity', 'Signals', 'Starting point', 'First brief'] as const;

const FOCUS_SUGGESTIONS = [
  'rust',
  'system design',
  'algorithms',
  'distributed systems',
  'postgres',
  'typescript',
  'interviewing',
  'leadership',
];

function initialStep(profileName: string | null | undefined, hasOpenTasks: boolean, connected: boolean): Step {
  if (profileName && hasOpenTasks) return 4;
  if (profileName && connected) return 3;
  if (profileName) return 2;
  return 1;
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const [step, setStep] = useState<Step | null>(null);
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [focusDraft, setFocusDraft] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => profileApi.get(signal),
    retry: false,
  });

  const onboarding = useQuery({
    queryKey: queryKeys.onboarding,
    queryFn: ({ signal }) => onboardingApi.status(signal),
    retry: false,
  });

  const taskList = useQuery({
    queryKey: queryKeys.tasks.list('open'),
    queryFn: ({ signal }) => tasksApi.list('open', signal),
    retry: false,
    staleTime: 30_000,
  });

  const integrations = useQuery({
    queryKey: queryKeys.integrations,
    queryFn: ({ signal }) => integrationsApi.status(signal),
    retry: false,
  });

  useEffect(() => {
    document.title = 'Calibration · MrT';
  }, []);

  useEffect(() => {
    if (initialized || !profile.isFetched) return;
    const data = profile.data;
    setName(data?.name ?? user?.name ?? '');
    setTargetDate(data?.target_interview_date ?? '');
    setFocusAreas(data?.focus_areas ?? []);
    setInitialized(true);
  }, [initialized, profile.data, profile.isFetched, user?.name]);

  useEffect(() => {
    if (step !== null || !profile.isFetched || !onboarding.isFetched || !taskList.isFetched) {
      return;
    }
    setStep(
      initialStep(
        profile.data?.name,
        (taskList.data?.length ?? 0) > 0,
        Boolean(onboarding.data?.google_connected || onboarding.data?.daily_dev_connected),
      ),
    );
  }, [
    onboarding.data,
    onboarding.isFetched,
    profile.data,
    profile.isFetched,
    step,
    taskList.data,
    taskList.isFetched,
  ]);

  const connectedGoogle = integrations.data?.providers.google?.connected ?? false;
  const connectedGmail = integrations.data?.providers.gmail?.connected ?? false;
  const googleConfigured = integrations.data?.clients_configured.google ?? false;
  const gmailConfigured = integrations.data?.clients_configured.gmail ?? false;
  const dailyDevConfigured = integrations.data?.clients_configured.dailydev ?? false;

  const saveProfile = useMutation({
    mutationFn: () =>
      profileApi.update({
        name: name.trim() || null,
        target_interview_date: targetDate || null,
        focus_areas: focusAreas,
      }),
    onSuccess: () => {
      setActionError(null);
      for (const key of invalidation.afterProfileWrite) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      setStep(2);
    },
    onError: (error) => setActionError(describeApiError(error)),
  });

  const seed = useMutation({
    mutationFn: () => onboardingApi.seed(),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      for (const key of invalidation.afterTaskWrite) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      setStep(4);
    },
    onError: (error) => setActionError(describeApiError(error)),
  });

  const refreshDailyDev = useMutation({
    mutationFn: () => integrationsApi.refreshDailyDev(),
    onSuccess: (feeds) => {
      setActionError(null);
      setOauthNotice(
        `daily.dev is warm: ${feeds.for_you.length + feeds.discussed.length} cached reads.`,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.dailyDev });
      void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
    },
    onError: (error) => setActionError(describeApiError(error)),
  });

  const compose = useMutation({
    mutationFn: () => briefingApi.refresh(),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.brief.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      finish();
    },
    onError: (error) => setActionError(describeApiError(error)),
  });

  const taskCount = taskList.data?.length ?? 0;
  const connectedSignals = [
    connectedGoogle,
    connectedGmail,
    Boolean(onboarding.data?.daily_dev_connected),
  ].filter(Boolean).length;

  const summary = useMemo(
    () => ({
      name: name.trim() || 'Unnamed operator',
      target: targetDate || 'No target date',
      focus: focusAreas.length > 0 ? focusAreas.join(' · ') : 'No focus areas yet',
    }),
    [focusAreas, name, targetDate],
  );

  function finish() {
    if (user) markOnboardingComplete(user.id);
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
    navigate('/brief', { replace: true });
  }

  function addFocus() {
    const next = focusDraft.trim().replace(/^#/, '');
    if (!next || focusAreas.includes(next) || focusAreas.length >= 8) return;
    setFocusAreas((current) => [...current, next]);
    setFocusDraft('');
  }

  function handleFocusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addFocus();
  }

  async function openConsent(provider: 'google' | 'gmail') {
    setActionError(null);
    setOauthNotice(null);
    const tab = window.open('about:blank', '_blank');
    try {
      const url =
        provider === 'google'
          ? await integrationsApi.googleConsentUrl()
          : await integrationsApi.gmailConsentUrl();
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setOauthNotice(
        'A consent tab opened. Finish the provider flow, then refresh signals here.',
      );
    } catch (error) {
      tab?.close();
      setActionError(describeApiError(error));
    }
  }

  function skipStep() {
    setActionError(null);
    if (step === null) return;
    if (step === 4) {
      finish();
      return;
    }
    setStep((step + 1) as Step);
  }

  function backStep() {
    setActionError(null);
    if (step && step > 1) setStep((step - 1) as Step);
  }

  if (step === null) {
    return (
      <div className="calibration">
        <header className="calibration__header">
          <Wordmark />
          <span className="mono-label">MRT // CALIBRATION</span>
          <span className="mono-label mono-label--muted">READING</span>
        </header>
        <main className="calibration__loading">
          <span />
          <span />
          <span />
        </main>
      </div>
    );
  }

  return (
    <div className="calibration">
      <header className="calibration__header">
        <Wordmark />
        <span className="mono-label">MRT // CALIBRATION</span>
        <span className="mono-label mono-label--muted">
          {String(step).padStart(2, '0')} / 04
        </span>
      </header>

      <div className="calibration__progress" aria-label={`Step ${step} of 4`}>
        {STEP_LABELS.map((label, index) => {
          const number = index + 1;
          return (
            <span
              key={label}
              className={`calibration__block ${
                number < step ? 'calibration__block--done' : ''
              } ${number === step ? 'calibration__block--active' : ''}`}
            >
              <span className="calibration__block-num">{String(number).padStart(2, '0')}</span>
              <span className="calibration__block-label">{label}</span>
            </span>
          );
        })}
      </div>

      <main className="calibration__layout">
        <section className="calibration__main">
          {step === 1 ? (
            <>
              <p className="eyebrow">
                <span className="eyebrow__pip" aria-hidden="true" />
                STEP 01 / IDENTITY
              </p>
              <h1>Who is MrT planning for?</h1>
              <p className="calibration__lede">
                This grounds priorities, reading picks, and drills. You can change it later.
              </p>

              <div className="calibration__form">
                <label className="field">
                  <span className="field__label">Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    maxLength={80}
                    autoFocus
                  />
                </label>

                <label className="field">
                  <span className="field__label">Target interview date — optional</span>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                  />
                </label>

                <div className="field">
                  <span className="field__label">Focus areas — up to 8</span>
                  <div className="focus-chips">
                    {focusAreas.map((area) => (
                      <span className="focus-chip" key={area}>
                        {area}
                        <button
                          type="button"
                          aria-label={`Remove ${area}`}
                          onClick={() =>
                            setFocusAreas((current) => current.filter((item) => item !== area))
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {focusAreas.length === 0 ? (
                      <span className="focus-chips__empty">No focus areas yet.</span>
                    ) : null}
                  </div>
                  <form className="focus-add" onSubmit={handleFocusSubmit}>
                    <input
                      type="text"
                      value={focusDraft}
                      onChange={(event) => setFocusDraft(event.target.value)}
                      placeholder="Add a focus area"
                      maxLength={40}
                      disabled={focusAreas.length >= 8}
                    />
                    <button
                      className="btn btn--ghost btn--small"
                      type="submit"
                      disabled={!focusDraft.trim() || focusAreas.length >= 8}
                    >
                      Add
                    </button>
                  </form>
                  <div className="focus-suggestions" aria-label="Suggested focus areas">
                    {FOCUS_SUGGESTIONS.filter((item) => !focusAreas.includes(item))
                      .slice(0, 5)
                      .map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="focus-suggestion"
                          onClick={() =>
                            setFocusAreas((current) =>
                              current.length >= 8 ? current : [...current, item],
                            )
                          }
                        >
                          + {item}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="eyebrow">
                <span className="eyebrow__pip" aria-hidden="true" />
                STEP 02 / SIGNALS
              </p>
              <h1>Give the brief something to read.</h1>
              <p className="calibration__lede">
                Connections are optional. MrT still works from your ledger without them.
              </p>

              {integrations.isError ? (
                <p className="inline-error" role="alert">
                  {describeApiError(integrations.error)}
                </p>
              ) : null}

              <div className="signal-list">
                <article className="signal">
                  <div>
                    <p className="mono-label">GOOGLE CALENDAR</p>
                    <h2>{connectedGoogle ? 'Connected' : 'Not connected'}</h2>
                    <p>See the week, find gaps, and ground priorities in real time.</p>
                  </div>
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => void openConsent('google')}
                    disabled={!googleConfigured || connectedGoogle}
                  >
                    {connectedGoogle ? 'Connected' : googleConfigured ? 'Connect' : 'Not configured'}
                  </button>
                </article>

                <article className="signal">
                  <div>
                    <p className="mono-label">GMAIL</p>
                    <h2>{connectedGmail ? 'Connected' : 'Not connected'}</h2>
                    <p>Metadata-only triage. Message bodies never leave Google.</p>
                  </div>
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => void openConsent('gmail')}
                    disabled={!gmailConfigured || connectedGmail}
                  >
                    {connectedGmail ? 'Connected' : gmailConfigured ? 'Connect' : 'Not configured'}
                  </button>
                </article>

                <article className="signal">
                  <div>
                    <p className="mono-label">DAILY.DEV</p>
                    <h2>{onboarding.data?.daily_dev_connected ? 'Cached' : 'Not cached'}</h2>
                    <p>Reading picks for the watchlist. The token stays on the server.</p>
                  </div>
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => refreshDailyDev.mutate()}
                    disabled={!dailyDevConfigured || refreshDailyDev.isPending}
                  >
                    {refreshDailyDev.isPending
                      ? 'Refreshing…'
                      : dailyDevConfigured
                        ? 'Refresh feeds'
                        : 'Not configured'}
                  </button>
                </article>
              </div>

              {oauthNotice ? <p className="calibration__notice">{oauthNotice}</p> : null}

              <button
                className="link-button"
                type="button"
                onClick={() => {
                  void integrations.refetch();
                  void onboarding.refetch();
                }}
              >
                I’ve finished consent — refresh signals
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="eyebrow">
                <span className="eyebrow__pip" aria-hidden="true" />
                STEP 03 / STARTING POINT
              </p>
              <h1>Start with something real.</h1>
              <p className="calibration__lede">
                Seed one sample per priority, or capture the first task in your own words.
              </p>

              <div className="start-options">
                <article className="start-option">
                  <span className="start-option__num">A</span>
                  <h2>Seed four samples</h2>
                  <p>One task for now, schedule, delegate, and drop. Idempotent and safe.</p>
                  <button
                    className="btn btn--ink"
                    type="button"
                    onClick={() => seed.mutate()}
                    disabled={seed.isPending || taskCount > 0}
                  >
                    {taskCount > 0
                      ? 'Ledger already has tasks'
                      : seed.isPending
                        ? 'Seeding…'
                        : 'Seed samples'}
                  </button>
                </article>

                <article className="start-option">
                  <span className="start-option__num">B</span>
                  <h2>Capture your first task</h2>
                  <p>Write it naturally. MrT returns proposals; you choose what to accept.</p>
                  <Link className="btn btn--ghost" to="/capture?return=/onboarding">
                    Open capture
                  </Link>
                </article>
              </div>

              {onboarding.isError ? (
                <p className="inline-error" role="alert">
                  {describeApiError(onboarding.error)}
                </p>
              ) : null}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <p className="eyebrow">
                <span className="eyebrow__pip" aria-hidden="true" />
                STEP 04 / FIRST BRIEF
              </p>
              <h1>Read the day back.</h1>
              <p className="calibration__lede">
                MrT will compose one brief from the ledger, then hand the decision to you.
              </p>

              <dl className="calibration__summary">
                <div>
                  <dt>Operator</dt>
                  <dd>{summary.name}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{summary.target}</dd>
                </div>
                <div>
                  <dt>Focus</dt>
                  <dd>{summary.focus}</dd>
                </div>
                <div>
                  <dt>Ledger</dt>
                  <dd>
                    {taskCount > 0
                      ? `${taskCount} open task${taskCount === 1 ? '' : 's'}`
                      : 'Still empty'}
                  </dd>
                </div>
                <div>
                  <dt>Signals</dt>
                  <dd>{connectedSignals > 0 ? `${connectedSignals} connected` : 'Ledger only'}</dd>
                </div>
              </dl>

              <div className="calibration__first-brief">
                <p className="mono-label">WHAT HAPPENS NEXT</p>
                <p>
                  {taskCount > 0
                    ? 'The brief proposes priorities and a drill. Nothing is written to the ledger unless you accept it.'
                    : 'The ledger is still empty. Go back to step 03 to seed or capture one task, or enter without a brief.'}
                </p>
                <button
                  className="btn btn--ink"
                  type="button"
                  onClick={() => compose.mutate()}
                  disabled={compose.isPending || taskCount === 0}
                >
                  {compose.isPending ? 'Composing…' : 'Compose first brief'}
                </button>
              </div>

              {actionError ? (
                <div className="calibration__fallback" role="alert">
                  <p className="inline-error">{actionError}</p>
                  <div>
                    <button className="btn btn--ghost btn--small" type="button" onClick={finish}>
                      Enter workspace anyway
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => setStep(3)}
                    >
                      Back to starting point
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {actionError && step !== 4 ? (
            <p className="inline-error calibration__error" role="alert">
              {actionError}
            </p>
          ) : null}
        </section>

        <aside className="calibration__aside">
          <p className="mono-label">THE SEQUENCE</p>
          <ol className="calibration__sequence">
            {STEP_LABELS.map((label, index) => {
              const number = index + 1;
              return (
                <li
                  key={label}
                  className={
                    number === step
                      ? 'calibration__sequence-item calibration__sequence-item--active'
                      : 'calibration__sequence-item'
                  }
                >
                  <span>{String(number).padStart(2, '0')}</span>
                  {label}
                </li>
              );
            })}
          </ol>
          <p className="calibration__aside-copy">
            Every step can be skipped. MrT proposes; you decide. Calibration can be reopened
            directly at <span className="mono-label">/onboarding</span>.
          </p>
          <div className="calibration__aside-mark" aria-hidden="true">
            T
          </div>
        </aside>
      </main>

      <footer className="calibration__footer">
        <div>
          {step > 1 ? (
            <button className="btn btn--ghost" type="button" onClick={backStep}>
              Back
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="calibration__footer-actions">
          <button className="btn btn--ghost" type="button" onClick={skipStep}>
            {step === 4 ? 'Enter without brief' : 'Skip this step'}
          </button>
          {step === 1 ? (
            <button
              className="btn btn--ink"
              type="button"
              onClick={() => saveProfile.mutate()}
              disabled={saveProfile.isPending}
            >
              {saveProfile.isPending ? 'Saving…' : 'Continue'}
            </button>
          ) : null}
          {step === 2 ? (
            <button className="btn btn--ink" type="button" onClick={() => setStep(3)}>
              Continue
            </button>
          ) : null}
          {step === 3 ? (
            <button className="btn btn--ink" type="button" onClick={() => setStep(4)}>
              Continue
            </button>
          ) : null}
          {step === 4 ? (
            <button
              className="btn btn--ink"
              type="button"
              onClick={() => compose.mutate()}
              disabled={compose.isPending || taskCount === 0}
            >
              {compose.isPending ? 'Composing…' : 'Compose & enter'}
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
