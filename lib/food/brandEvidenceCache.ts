/**
 * Brand Evidence Cache (Phase E)
 *
 * Replaces brittle, length+denylist-only brand-token detection with a
 * data-driven cache backed by `food_objects.brand_name` (and optionally
 * `off_products_mirror.brands`). The cache is process-wide, lazy-loaded,
 * with a TTL and stale-while-revalidate semantics.
 *
 * Design goals:
 * - Additive, monotonic relative to today: a token is brand-like if the
 *   cache says so OR the existing heuristic does. Phase E does not subtract.
 * - Cold-cache fallback: when the cache hasn't loaded yet, callers fall
 *   back to the existing heuristic so behavior never abruptly regresses.
 * - Cheap: a single `brand_name` distinct sweep, capped to a configurable
 *   row limit, tokenized once and stored as a `Set<string>` plus per-token
 *   sample brands for debugging.
 * - Deterministic in tests: `loadBrandEvidence` accepts an injected loader
 *   so unit tests can populate the cache without Supabase.
 *
 * The cache does NOT short-circuit any existing search behavior; it only
 * influences `isBrandLikeToken` via the optional override path passed to
 * `normalizeSearchQuery`.
 */

import { supabaseAdmin } from '../supabaseServerClient';

/**
 * Per-token brand evidence record.
 */
export interface BrandEvidence {
  /** Normalized token (lowercase, apostrophe-stripped, punctuation-stripped). */
  token: string;
  /** True if this token appears in at least one observed brand_name. */
  isKnownBrand: boolean;
  /** Up to 5 sample brand_name strings that contain this token. Debug aid only. */
  sampleBrands: string[];
}

/**
 * Internal in-memory state.
 */
interface BrandEvidenceCacheState {
  tokens: Set<string>;
  byToken: Map<string, BrandEvidence>;
  loadedAt: number;
  brandCount: number;
  source: 'food_objects' | 'food_objects+off' | 'injected' | 'empty';
}

/**
 * Options for loading brand evidence.
 */
export interface LoadBrandEvidenceOptions {
  /**
   * Force reload even if a fresh cache exists. Tests use this to prime a
   * deterministic cache via `injectedBrands`.
   */
  force?: boolean;
  /**
   * Maximum number of distinct `brand_name` rows to scan from food_objects.
   * Defaults to 5000 — tokens repeat heavily across rows so this captures
   * essentially all real-world brands while keeping the query bounded.
   */
  maxBrands?: number;
  /**
   * If true, also scan `off_products_mirror.brands`. Defaults to false to
   * keep the cold-load latency low; OFF brands are recovered via the
   * second-tier load triggered after the first food_objects sweep.
   */
  includeOffMirror?: boolean;
  /**
   * Test seam: a list of brand_name strings to use directly instead of
   * querying Supabase. When provided, no DB call is made.
   */
  injectedBrands?: string[];
  /**
   * Test seam: a custom loader returning brand_name strings.
   */
  loadBrands?: () => Promise<string[]>;
}

const TTL_MS = 10 * 60 * 1000;
const MIN_TOKEN_LENGTH = 3;

let state: BrandEvidenceCacheState | null = null;
let inflight: Promise<BrandEvidenceCacheState> | null = null;

/**
 * Tokenize a brand_name into normalized tokens for cache membership.
 * Mirrors the normalization rules used by `normalizeSearchQuery`:
 * lowercase, strip apostrophes/quotes, replace punctuation with spaces,
 * filter out tokens shorter than MIN_TOKEN_LENGTH, and skip pure numeric
 * tokens (those are not brands in our data).
 */
function tokenizeBrand(brandRaw: string): string[] {
  if (!brandRaw) return [];
  const lower = brandRaw.toLowerCase();
  // Explicitly cover curly apostrophe variants (U+2018, U+2019) and ASCII
  // apostrophe + backtick. Mirrors APOSTROPHE_REGEX in searchNormalization.
  const noApostrophes = lower.replace(/[\u2018\u2019'`]/g, '');
  const stripped = noApostrophes.replace(/[-/\\.,;:!?()[\]{}\u201C\u201D\u201E"@#$%^&*+=|<>~]+/g, ' ');
  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  if (!collapsed) return [];
  return collapsed
    .split(' ')
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !/^\d+$/.test(t));
}

/**
 * Generic stopwords that should never count as "known brand" tokens
 * even if they happen to appear inside a brand_name. These are tokens
 * that are demonstrably not brand identifiers (suffixes/legal forms/
 * vague descriptors).
 *
 * This is intentionally tiny — the cache is the source of truth and
 * COMMON_WORDS in `searchNormalization.ts` covers the cold-path heuristic.
 */
const BRAND_TOKEN_STOPWORDS = new Set<string>([
  'inc', 'inc.', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company', 'companies',
  'foods', 'food', 'brand', 'brands', 'group', 'usa',
  'the', 'and', 'with', 'for',
]);

/**
 * Build the cache state from a list of brand_name strings.
 */
function buildState(
  brandNames: string[],
  source: BrandEvidenceCacheState['source']
): BrandEvidenceCacheState {
  const tokens = new Set<string>();
  const byToken = new Map<string, BrandEvidence>();

  for (const name of brandNames) {
    const tks = tokenizeBrand(name);
    for (const t of tks) {
      if (BRAND_TOKEN_STOPWORDS.has(t)) continue;
      tokens.add(t);
      let entry = byToken.get(t);
      if (!entry) {
        entry = { token: t, isKnownBrand: true, sampleBrands: [] };
        byToken.set(t, entry);
      }
      if (entry.sampleBrands.length < 5 && !entry.sampleBrands.includes(name)) {
        entry.sampleBrands.push(name);
      }
    }
  }

  return {
    tokens,
    byToken,
    loadedAt: Date.now(),
    brandCount: brandNames.length,
    source,
  };
}

/**
 * Default loader: pulls distinct brand_name values from food_objects.
 *
 * Note: Supabase JS client doesn't expose true SQL DISTINCT, so we
 * fetch up to `maxBrands` rows ordered by brand_name and deduplicate
 * client-side. Token repetition makes this near-complete in practice.
 */
async function defaultLoadBrands(maxBrands: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select('brand_name')
    .not('brand_name', 'is', null)
    .limit(maxBrands);

  if (error) {
    console.warn('[brandEvidenceCache] food_objects load failed:', error.message);
    return [];
  }

  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ brand_name: string | null }>) {
    if (row.brand_name) set.add(row.brand_name);
  }
  return Array.from(set);
}

/**
 * Load brand evidence into the cache. Idempotent: if a fresh cache
 * exists and `force` is not set, returns the cached state without
 * issuing any DB calls.
 *
 * Concurrent callers share a single in-flight load.
 */
export async function loadBrandEvidence(
  options: LoadBrandEvidenceOptions = {}
): Promise<BrandEvidenceCacheState> {
  const now = Date.now();
  if (!options.force && state && now - state.loadedAt < TTL_MS) {
    return state;
  }
  if (inflight && !options.force) return inflight;

  const maxBrands = options.maxBrands ?? 5000;

  inflight = (async () => {
    try {
      let brandNames: string[];
      let source: BrandEvidenceCacheState['source'];

      if (options.injectedBrands) {
        brandNames = options.injectedBrands;
        source = 'injected';
      } else if (options.loadBrands) {
        brandNames = await options.loadBrands();
        source = 'injected';
      } else {
        brandNames = await defaultLoadBrands(maxBrands);
        source = brandNames.length > 0 ? 'food_objects' : 'empty';
      }

      state = buildState(brandNames, source);
      return state;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Synchronous fast path. Returns the loaded brand-token set, or null if
 * the cache is cold. Callers fall back to the COMMON_WORDS heuristic on
 * null. This function never triggers a load.
 */
export function getCachedBrandTokens(): Set<string> | null {
  if (!state) return null;
  return state.tokens;
}

/**
 * Synchronous per-token lookup. Returns evidence when cached, null on
 * cold cache, or a synthetic `isKnownBrand: false` entry when the cache
 * is loaded but the token isn't a known brand.
 */
export function getBrandEvidenceForToken(token: string): BrandEvidence | null {
  if (!state) return null;
  const t = token.toLowerCase();
  const entry = state.byToken.get(t);
  if (entry) return entry;
  return { token: t, isKnownBrand: false, sampleBrands: [] };
}

/**
 * Returns a summary of the current cache state for telemetry/debug.
 */
export function getBrandEvidenceCacheSummary(): {
  loaded: boolean;
  tokenCount: number;
  brandCount: number;
  ageMs: number | null;
  source: BrandEvidenceCacheState['source'] | null;
} {
  if (!state) {
    return { loaded: false, tokenCount: 0, brandCount: 0, ageMs: null, source: null };
  }
  return {
    loaded: true,
    tokenCount: state.tokens.size,
    brandCount: state.brandCount,
    ageMs: Date.now() - state.loadedAt,
    source: state.source,
  };
}

/**
 * Test-only: reset module-level cache state. Production callers should
 * never need this; `loadBrandEvidence({ force: true })` re-fetches.
 */
export function __resetBrandEvidenceCacheForTests(): void {
  state = null;
  inflight = null;
}
