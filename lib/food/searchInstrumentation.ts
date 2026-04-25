/**
 * Phase A — Search instrumentation.
 *
 * Extracted from `foodServerService.ts` in Phase C-lite. Pure additive code:
 * the collector and helpers shape per-stage timings, retrieval evidence, gate
 * reasoning, and winner rationale. They never affect search behavior.
 *
 * No DB I/O. Safe to import from anywhere on the server side.
 */
import type {
  FoodSearchConsumerEcho,
  FoodSearchFallbackDebug,
  FoodSearchRetrievalDebug,
  FoodSearchStageTiming,
  FoodSearchWinnerRationale,
  FoodSearchResult,
} from './types';
import { getGroupKey } from './sameItem';

/**
 * Lightweight collector threaded through searchFoods so every stage can
 * record timing, retrieval evidence, and gate/winner rationale without
 * each step having to know about the others.
 *
 * No behavior change: instrumentation is collected unconditionally so the
 * structured server log line always has data, but the result is only
 * attached to the response when debug=true.
 */
export class SearchInstrumentation {
  private readonly startedAt: number = Date.now();
  readonly stageTimings: FoodSearchStageTiming[] = [];
  readonly retrieval: FoodSearchRetrievalDebug[] = [];
  fallbackGate: FoodSearchFallbackDebug | null = null;
  winnerRationale: FoodSearchWinnerRationale[] = [];
  consumer: FoodSearchConsumerEcho | null = null;

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  recordStage(entry: FoodSearchStageTiming): void {
    this.stageTimings.push(entry);
  }

  recordRetrieval(entry: FoodSearchRetrievalDebug): void {
    this.retrieval.push(entry);
    // Mirror retrieval timings into stageTimings so a single timeline view exists.
    this.stageTimings.push({
      stage: entry.stage,
      ms: entry.ms,
      rows: entry.rows,
      timedOut: entry.timedOut,
      error: entry.error,
    });
  }
}

/**
 * Truncate a PostgREST filter string for debug logs without exploding payload
 * size. Keeps the first 240 chars + a length suffix so reviewers can still
 * recognize the query shape.
 */
export function digestFilter(filter: string | undefined | null): string {
  if (!filter) return '';
  if (filter.length <= 240) return filter;
  return `${filter.slice(0, 240)}…(+${filter.length - 240} chars)`;
}

/**
 * Run an awaitable with timing; record both retrieval evidence and a
 * stage entry. The fn must return either a Supabase-style { data, error }
 * envelope or any value — the wrapper uses what it gets.
 *
 * Behavior preserved verbatim from the previous in-line implementation:
 *   - On caught throw: emits `{ data: null, error: { message }, ms }`.
 *   - On Supabase-reported error: emits `{ data, error, ms }` and records
 *     `error?.message` (NOT code) on the retrieval entry.
 *   - `rows` is `data.length` when data is an array, else 0.
 */
export async function withRetrievalTiming<T>(
  instr: SearchInstrumentation,
  stage: string,
  table: string,
  filterDigest: string,
  fn: () => Promise<{ data: T | null; error: { message?: string; code?: string } | null }>
): Promise<{ data: T | null; error: { message?: string; code?: string } | null; ms: number }> {
  const t0 = Date.now();
  let data: T | null = null;
  let error: { message?: string; code?: string } | null = null;
  let thrown: unknown = null;
  try {
    const res = await fn();
    data = res.data;
    error = res.error ?? null;
  } catch (err) {
    thrown = err;
  }
  const ms = Date.now() - t0;
  const errorMessage = thrown
    ? (thrown instanceof Error ? thrown.message : String(thrown))
    : error?.message;
  const rows = Array.isArray(data) ? (data as unknown[]).length : 0;
  instr.recordRetrieval({
    stage,
    table,
    filterDigest,
    rows,
    ms,
    timedOut: false,
    error: errorMessage,
  });
  if (thrown) {
    return { data: null, error: { message: errorMessage }, ms };
  }
  return { data, error, ms };
}

/**
 * Phase D — winner-rationale group key now comes from the same-item identity
 * model (see `lib/food/sameItem.getGroupKey`). Two rows that prove same-item
 * therefore share a groupKey, which makes suppression debugging deterministic.
 */
export function buildGroupKeyForRationale(result: FoodSearchResult): string {
  return getGroupKey(result);
}
