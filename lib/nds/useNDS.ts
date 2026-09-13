/**
 * useNDS — React hook for the daily Nutrition Density Score.
 *
 * NDS Integrity v1. Every mounted consumer of a given (person, day) now reads the
 * SAME shared entry from lib/nds/ndsDayStore.ts, so the log page gauge, the app
 * home scroller, the journal home card and insights cannot show four different
 * numbers for one day of eating.
 *
 * The important change for callers is `state`, a discriminated union in which a
 * day with nothing logged, a day whose inputs cannot be interpreted, and a failed
 * computation are DIFFERENT VALUES rather than a shared `nds_score_100: 0`.
 *
 * `data` is retained for existing call sites and is deliberately NULL unless the
 * state actually carries a printable score. That is what makes the older
 * zero-defaulting patterns stop asserting a number they cannot support: a
 * consumer that falls back on absent data now falls back to "no score".
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useSyncExternalStore } from 'react';

import type {
  DailyNdsReadings,
  DailyNdsState,
  DailyNdsSubscores,
} from './dailyNdsState';
import { hasPrintableScore, isProvisional } from './dailyNdsState';
import {
  ensureNdsDayLoaded,
  getNdsDaySnapshot,
  initialNdsDaySnapshot,
  refreshNdsDay,
  subscribeToNdsDay,
  type NdsResponseMeta,
} from './ndsDayStore';

export { notifyNdsSourceChanged, resetNdsDayStore } from './ndsDayStore';

// ============================================================================
// Types
// ============================================================================

export interface NDSMeta extends Partial<NdsResponseMeta> {
  computed_at?: string;
  /** Entries that actually contributed to the score. */
  scored_entry_count?: number;
  /** Entries present for the day that could not be interpreted. */
  unscorable_entry_count?: number;
}

/**
 * Human-facing readings for the Home NDS scroller.
 * These are intentionally separate from the 0-10 scoring subscores because the
 * UI copy calls for mixed print formats: percentages, grams, and score values.
 *
 * A reading is `null` when it is NOT KNOWN. It is never 0 as a stand-in, because
 * "no added sugar" and "we have no added-sugar data" are different claims.
 */
export type NDSReadings = DailyNdsReadings;

export interface NDSData {
  date_local: string;
  person_id: string;
  nds_score_100: number;
  subscores_10: DailyNdsSubscores;
  readings: NDSReadings;
  nds_version: string;
  classifier_version: string;
  /** True while a newer score is being produced for this day. */
  is_provisional: boolean;
  _meta?: NDSMeta;
}

export interface UseNDSOptions {
  /** Date in YYYY-MM-DD format. Defaults to today in the browser's timezone. */
  dateLocal?: string;
  /** Person ID. Defaults to the authenticated user. */
  personId?: string;
  /** Whether to fetch automatically. Defaults to true. */
  autoFetch?: boolean;
  /** Whether the NDS feature is enabled. If false, won't fetch. */
  enabled?: boolean;
  /** Admin-only debug payload. Ignored by the server for everyone else. */
  includeDebug?: boolean;
}

export interface UseNDSResult {
  /**
   * The server's answer for this day, or null before the first response.
   * Branch on `state.state`; this is the truthful channel.
   */
  state: DailyNdsState | null;
  /** Non-null ONLY when the state carries a score that may be printed. */
  data: NDSData | null;
  isLoading: boolean;
  /** A failure to REACH the score. A day the server could not score is a state. */
  error: string | null;
  debugData: Record<string, unknown> | null;
  /** Re-read the day. The server decides whether its cached score is still valid. */
  refetch: () => Promise<void>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Today's date in the browser's timezone, which is the best available proxy for
 * the subject's own day boundary on the client.
 */
function getTodayDateLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Project a state onto the legacy `NDSData` shape.
 *
 * Returns null for every state without a score. There is no zero fallback here
 * on purpose: a caller that wants to show something for an empty day must look
 * at `state` and say what is actually true about it.
 */
export function projectLegacyNdsData(
  state: DailyNdsState | null,
  meta: NdsResponseMeta | null = null,
): NDSData | null {
  if (!state || !hasPrintableScore(state)) return null;
  return {
    date_local: state.date_local,
    person_id: state.person_id,
    nds_score_100: state.nds_score_100,
    subscores_10: state.subscores_10,
    readings: state.readings,
    nds_version: state.versions.nds_version,
    classifier_version: state.versions.classifier_version,
    is_provisional: isProvisional(state),
    _meta: {
      ...(meta ?? {}),
      computed_at: state.computed_as_of,
      scored_entry_count: state.coverage.scored_entry_count,
      unscorable_entry_count: state.coverage.unscorable_entry_count,
    },
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useNDS(options: UseNDSOptions = {}): UseNDSResult {
  const {
    dateLocal = getTodayDateLocal(),
    personId,
    autoFetch = true,
    enabled = true,
    includeDebug = false,
  } = options;

  const parts = useMemo(
    () => ({ personId: personId ?? null, dateLocal }),
    [personId, dateLocal],
  );

  const subscribe = useCallback(
    (listener: () => void) => subscribeToNdsDay(parts, listener),
    [parts],
  );
  const getSnapshot = useCallback(() => getNdsDaySnapshot(parts), [parts]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, initialNdsDaySnapshot);

  useEffect(() => {
    if (!autoFetch || !enabled) return;
    void ensureNdsDayLoaded({ ...parts, includeDebug });
  }, [autoFetch, enabled, parts, includeDebug]);

  const refetch = useCallback(
    () => refreshNdsDay({ ...parts, includeDebug }),
    [parts, includeDebug],
  );

  const data = useMemo(
    () => projectLegacyNdsData(snapshot.state, snapshot.meta),
    [snapshot.state, snapshot.meta],
  );

  return {
    state: snapshot.state,
    data,
    // Before the first answer arrives there is nothing to show, so an unstarted
    // day reads as loading rather than as an empty day.
    isLoading: snapshot.isLoading || (enabled && autoFetch && snapshot.state === null && snapshot.error === null),
    error: snapshot.error,
    debugData: snapshot.debugData,
    refetch,
  };
}

// ============================================================================
// Helper Functions for UI
// ============================================================================

/**
 * Get a color class for NDS score.
 */
export function getNDSColorClass(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-lime-500';
  if (score >= 40) return 'text-yellow-500';
  if (score >= 20) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * Get a label for NDS score.
 */
export function getNDSLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Needs Work';
  return 'Poor';
}

/**
 * Get subscore display info.
 */
export const SUBSCORE_INFO = {
  wfr: { label: 'Whole Foods', shortLabel: 'WFR', description: 'Ratio of whole to processed foods' },
  ps: { label: 'Protein', shortLabel: 'PS', description: 'Protein quality and quantity' },
  pnd: { label: 'Plant Variety', shortLabel: 'PND', description: 'Variety of plant colors' },
  fp: { label: 'Fiber', shortLabel: 'FP', description: 'Daily fiber progress' },
  as: { label: 'Added Sugar', shortLabel: 'AS', description: 'Lower sugar = higher score' },
  mnc: { label: 'Micronutrients', shortLabel: 'MNC', description: 'Vitamin/mineral coverage' },
  ob: { label: 'Omega Balance', shortLabel: 'OB', description: 'Omega-3 to Omega-6 ratio' },
} as const;

/**
 * Get color class for subscore value (0-10).
 */
export function getSubscoreColorClass(score: number): string {
  if (score >= 8) return 'bg-green-500';
  if (score >= 6) return 'bg-lime-500';
  if (score >= 4) return 'bg-yellow-500';
  if (score >= 2) return 'bg-orange-500';
  return 'bg-red-500';
}
