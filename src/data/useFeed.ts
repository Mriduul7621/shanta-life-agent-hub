/**
 * Stale-while-revalidate feed state, shared by Home and the Leads /
 * Learning pages.
 *
 * One feed, three states:
 * - 'loading': no summary yet and the fresh fetch has not resolved.
 *   The page shows a loading skeleton — never demo figures, never a
 *   zero presented as data.
 * - 'ready': a summary is showing (cached, fresh, or cached-while-a-
 *   refresh-failed — a failed refresh keeps the cached summary,
 *   same as the Dashboard's refreshFailed rule).
 * - 'error': no summary at all and the fresh fetch failed (after
 *   its one retry). The page shows an error state with a retry
 *   action — never the demo fallback. (2026-11-20: a real
 *   employee's retail fetch failed transiently and Home fell back
 *   to the demo fixture — dues 2 / ৳48,500, business ৳1,85,000 —
 *   as if it were her data. That path is gone: real users never
 *   see fixture figures.)
 *
 * A period change with no cache for the new period resets to
 * 'loading' (never show another period's figures under the new
 * period's label) — same as the Dashboard.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PeriodSelection } from './period';

export type FeedStatus = 'loading' | 'ready' | 'error';

export interface FeedState<T> {
  summary: T | null;
  status: FeedStatus;
  /** Re-run the fresh fetch (also re-reads the cache first). */
  retry: () => void;
}

interface LoadResult<T> {
  summary: T;
  syncedAt: number;
  fromCache: boolean;
}

export function useFeed<T>(
  loadCached: (employeeId: string, selection: PeriodSelection) => LoadResult<T> | null,
  loadFresh: (token: string, employeeId: string, selection: PeriodSelection) => Promise<LoadResult<T>>,
  token: string | null,
  employeeId: string,
  selection: PeriodSelection,
  enabled = true,
): FeedState<T> {
  const [summary, setSummary] = useState<T | null>(null);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !token || !employeeId) return;
    let cancelled = false;
    const cached = loadCached(employeeId, selection);
    if (cached) {
      setSummary(cached.summary);
      setStatus('ready');
    } else {
      setSummary(null);
      setStatus('loading');
    }
    void loadFresh(token, employeeId, selection)
      .then((r) => {
        if (!cancelled) {
          setSummary(r.summary);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (cancelled) return;
        // A failed refresh keeps the cached summary; only a failure
        // with nothing cached is an error.
        if (!cached) {
          setSummary(null);
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
    // loadCached / loadFresh are module-level functions (stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, employeeId, selection, enabled, retryNonce]);

  const retry = useCallback(() => {
    setStatus((s) => (s === 'error' ? 'loading' : s));
    setRetryNonce((n) => n + 1);
  }, []);

  return { summary, status, retry };
}
