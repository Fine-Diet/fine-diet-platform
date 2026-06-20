/**
 * Log Builder Search — Client service (browser)
 *
 * Thin fetch wrapper around the read-only `GET /api/log/search` endpoint for the
 * Log Builder UI. Mirrors the conventions of `foodService` (same-origin fetch,
 * cookie auth, safe empty fallback on error). Client-only: imports nothing from
 * the server service — only the shared contract in `./types`.
 */

import type { LogSearchBankKey, LogSearchResponse } from './types';

export interface LogSearchClientOptions {
  banks?: LogSearchBankKey[];
  limit?: number;
  sectionLimit?: number;
  debug?: boolean;
  sessionId?: string;
  /** Allows callers to cancel an in-flight request (debounced search). */
  signal?: AbortSignal;
}

/** Safe empty response used on error or short-circuit. */
function emptyResponse(query: string, banks: LogSearchBankKey[]): LogSearchResponse {
  return {
    query,
    sections: [],
    results: [],
    banks: {
      foods: { sectionCount: 0, total: 0 },
      meals: { total: 0 },
      recipes: { total: 0 },
      recent: { total: 0 },
    },
    captureActions: [],
  };
}

export const logSearchService = {
  /**
   * Read-only Log Builder search across the requested banks. Returns the parsed
   * `LogSearchResponse`, or a safe empty response on network/parse error. An
   * aborted request resolves to the empty response (callers can ignore it).
   */
  async search(
    query: string,
    options: LogSearchClientOptions = {},
  ): Promise<LogSearchResponse> {
    const {
      banks,
      limit,
      sectionLimit,
      debug = false,
      sessionId,
      signal,
    } = options;
    const effectiveBanks = banks ?? ['foods', 'meals', 'recipes', 'recent'];

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (banks && banks.length > 0) params.set('banks', banks.join(','));
      if (typeof limit === 'number') params.set('limit', String(limit));
      if (typeof sectionLimit === 'number') params.set('sectionLimit', String(sectionLimit));
      if (debug) params.set('debug', 'true');

      const headers: HeadersInit = sessionId ? { 'x-session-id': sessionId } : {};
      const res = await fetch(`/api/log/search?${params.toString()}`, { headers, signal });
      if (!res.ok) return emptyResponse(query, effectiveBanks);

      const data = (await res.json()) as LogSearchResponse;
      return data;
    } catch (error) {
      if (signal?.aborted) return emptyResponse(query, effectiveBanks);
      console.error('[logSearchService.search] Error:', error);
      return emptyResponse(query, effectiveBanks);
    }
  },
};
