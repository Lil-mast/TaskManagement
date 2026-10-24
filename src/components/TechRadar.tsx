import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';

import { ApiError, integrationsApi } from '@/lib/api';
import type { WatchItem } from '@/lib/api/schemas/integrations';
import { queryKeys } from '@/lib/query/keys';

type RadarItem = WatchItem & { feed: 'FOR YOU' | 'DISCUSSED' };

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) return 'daily.dev is not configured on the server.';
    return error.message || `Request failed (${error.status || 'network'}).`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function metaFor(item: RadarItem): string[] {
  const meta = [item.feed, item.source ?? 'daily.dev'];
  if (item.read_time && item.read_time > 0) {
    const minutes = item.read_time;
    meta.push(
      minutes >= 60
        ? `${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, '0')}M`
        : `${minutes} MIN`,
    );
  }
  if (item.num_upvotes > 0) meta.push(`${item.num_upvotes} UPVOTES`);
  if (item.num_comments > 0) meta.push(`${item.num_comments} COMMENTS`);
  return meta;
}

export function TechRadar() {
  const queryClient = useQueryClient();

  const feeds = useQuery({
    queryKey: queryKeys.dailyDev,
    queryFn: ({ signal }) => integrationsApi.dailyDevFeeds(signal),
    retry: 1,
  });

  const refresh = useMutation({
    mutationFn: () => integrationsApi.refreshDailyDev(),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.dailyDev, data);
    },
  });

  const items = useMemo<RadarItem[]>(() => {
    const seen = new Set<string>();
    const combined: RadarItem[] = [
      ...(feeds.data?.for_you ?? []).map((item) => ({ ...item, feed: 'FOR YOU' as const })),
      ...(feeds.data?.discussed ?? []).map((item) => ({ ...item, feed: 'DISCUSSED' as const })),
    ];

    return combined
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .slice(0, 7);
  }, [feeds.data]);

  const syncedAt = feeds.data?.fetched_at
    ? format(parseISO(feeds.data.fetched_at), 'dd MMM HH:mm')
    : 'NOT SYNCED';
  const feedState = feeds.isPending
    ? 'READING'
    : feeds.isError || !feeds.data || items.length === 0
      ? 'NOT SYNCED'
      : feeds.data.from_cache
        ? 'CACHED · 24H'
        : 'FRESH FEED';

  return (
    <section className="panel radar" aria-label="Tech radar">
      <header className="panel__head">
        <span>TECH RADAR</span>
        <button
          className="link-button"
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || feeds.isPending}
        >
          {refresh.isPending ? 'REFRESHING…' : 'REFRESH'}
        </button>
      </header>

      {feeds.isPending ? (
        <div className="radar__skeleton" aria-label="Loading daily.dev feeds">
          <span />
          <span />
          <span />
        </div>
      ) : feeds.isError ? (
        <p className="inline-error" role="alert">
          {describeError(feeds.error)}
        </p>
      ) : items.length > 0 ? (
        <ol className="radar__list">
          {items.map((item, index) => (
            <li className="radar__item" key={item.id}>
              <span className="radar__num">{String(index + 1).padStart(2, '0')}</span>
              <div className="radar__body">
                <a
                  className="radar__title"
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.title}
                </a>
                <div className="radar__meta">
                  {metaFor(item).map((value) => (
                    <span key={value} className={value === item.feed ? 'radar__feed' : undefined}>
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="radar__empty">
          <p>No cached feeds. Refresh daily.dev.</p>
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            {refresh.isPending ? 'Refreshing…' : 'Refresh feeds'}
          </button>
        </div>
      )}

      {refresh.isError ? (
        <p className="inline-error" role="alert">
          {describeError(refresh.error)}
        </p>
      ) : null}

      <footer className="radar__foot">
        <span className="mono-label">{feedState}</span>
        <span className="mono-label">{syncedAt}</span>
      </footer>
    </section>
  );
}
