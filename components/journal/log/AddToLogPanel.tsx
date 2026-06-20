'use client';

/**
 * Add to Log panel — Log Builder UI (read-only integration, packet
 * FD-LOG-BUILDER:ui-integration-v1).
 *
 * Presentational pieces that wire the log surface to the merged, read-only
 * `/api/log/search` layer without touching the existing food create-entry path:
 *
 *   - AddToLogModeTabs  — Search / Library / Capture mode switch.
 *   - SearchModeBanks   — Meals / Recipes / Recent banks shown beneath the
 *                         existing food search results in Search mode (driven by
 *                         the shared search query).
 *   - LibraryMode       — browseable Meals / Recipes / Recent view with its own
 *                         search input.
 *   - CaptureMode       — safe placeholder cards for unfinished capture tools.
 *
 * Logging safety:
 *   - Recent results re-log through the existing single-food path (onLogRecent).
 *   - Meal / Recipe results are NOT writable yet (no grouped meal write path in
 *     this packet) — their add buttons are disabled and labeled "Soon".
 *   - Capture tools are placeholders; only Import Recipe routes to an existing
 *     page. Scan/Barcode are inert "Coming soon".
 *
 * Result metadata from `/api/log/search` is preserved distinctly: result kind,
 * source section, relationship/source badges, and loggable shape are shown as
 * separate signals and never collapsed into one label.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { logSearchService } from '@/lib/logSearch/logSearchService';
import type {
  LogCaptureAction,
  LogSearchBadge,
  LogSearchBadgeKind,
  LogSearchBankKey,
  LogSearchLoggableShape,
  LogSearchResult,
  LogSearchSection,
  RecentLoggedItem,
} from '@/lib/logSearch/types';

export type LogMode = 'search' | 'library' | 'capture';

// ============================================================================
// Presentation helpers
// ============================================================================

const BADGE_CLASS: Record<LogSearchBadgeKind, string> = {
  branded: 'border border-brand-200/20 bg-brand-200/10 text-brand-50/80',
  common: 'border border-brand-200/20 bg-brand-200/10 text-brand-50/80',
  scanned: 'border border-brand-200/20 bg-brand-200/10 text-brand-50/80',
  my_food: 'border border-brand-200/25 bg-brand-200/10 text-brand-50/85',
  open_food_facts: 'border border-rose-400/25 bg-rose-500/15 text-rose-100',
  used_in_meals: 'border border-brand-200/30 bg-brand-200/15 text-brand-50/90',
  in_recipes: 'border border-violet-400/25 bg-violet-500/15 text-violet-100',
  recently_logged: 'border border-sky-400/25 bg-sky-500/15 text-sky-100',
  saved_meal: 'border border-emerald-400/25 bg-emerald-500/15 text-emerald-100',
  recipe: 'border border-violet-400/25 bg-violet-500/15 text-violet-100',
  needs_review: 'border border-amber-400/25 bg-amber-500/15 text-amber-100',
};

const LOGGABLE_SHAPE_LABEL: Record<LogSearchLoggableShape, string> = {
  single_item: 'Item',
  full_meal: 'Full meal',
  multi_item_meal: 'Meal',
  recipe: 'Recipe',
};

function BadgeRow({ badges, shape }: { badges: LogSearchBadge[]; shape: LogSearchLoggableShape }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 pt-2">
      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-brand-50/70">
        {LOGGABLE_SHAPE_LABEL[shape]}
      </span>
      {badges.map((badge) => (
        <span
          key={`${badge.kind}-${badge.label}`}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_CLASS[badge.kind] ?? 'border border-white/15 bg-white/5 text-brand-50/70'}`}
        >
          {badge.label}
        </span>
      ))}
    </span>
  );
}

function formatKcal(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value)} cal`;
}

// ============================================================================
// Result rows
// ============================================================================

/** Meal / Recipe row — read-only in this packet (no grouped write path yet). */
function MealRecipeRow({ result }: { result: LogSearchResult }) {
  if (result.kind !== 'meal' && result.kind !== 'recipe') return null;
  const doc = result.kind === 'meal' ? result.meal : result.recipe;
  const componentCount = doc.components.length;
  const kcal = doc.totals?.calories ?? doc.per_serving?.calories ?? null;

  return (
    <div className="flex items-center gap-2 border-b border-brand-900/50 px-4 py-4">
      <div className="flex-1 flex flex-col min-w-0">
        <span className="text-brand-50 font-semibold text-xl truncate">{result.title}</span>
        <span className="text-brand-50/60 text-sm pt-1 truncate">
          {componentCount} {componentCount === 1 ? 'item' : 'items'}
          {kcal != null && <> · {formatKcal(kcal)}</>}
        </span>
        <BadgeRow badges={result.badges} shape={result.loggableShape} />
      </div>
      {/* No grouped meal write path in this packet — disabled, labeled "Soon". */}
      <span
        className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-brand-50/45"
        aria-disabled="true"
        title="Logging meals and recipes is coming soon"
      >
        Soon
      </span>
    </div>
  );
}

/** Recent row — re-logs through the existing single-food path. */
function RecentRow({
  result,
  onLogRecent,
}: {
  result: LogSearchResult;
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
}) {
  if (result.kind !== 'recent_entry') return null;
  const item = result.recent;

  return (
    <div className="flex items-center gap-2 border-b border-brand-900/50 hover:bg-brand-400/60 transition-colors px-4 py-4">
      <button
        type="button"
        onClick={() => void onLogRecent(item)}
        className="flex-1 flex flex-col text-left min-w-0"
      >
        <span className="text-brand-50 font-semibold text-xl truncate">{result.title}</span>
        <span className="text-brand-50/60 text-sm pt-1 truncate">{formatKcal(item.calories)}</span>
        <BadgeRow badges={result.badges} shape={result.loggableShape} />
      </button>
      <button
        type="button"
        onClick={() => void onLogRecent(item)}
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-brand-50/60 hover:text-brand-50 hover:bg-brand-500/60 transition-colors"
        aria-label="Add to log"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}

function ResultRow({
  result,
  onLogRecent,
}: {
  result: LogSearchResult;
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
}) {
  if (result.kind === 'recent_entry') return <RecentRow result={result} onLogRecent={onLogRecent} />;
  if (result.kind === 'meal' || result.kind === 'recipe') return <MealRecipeRow result={result} />;
  return null;
}

// ============================================================================
// Banks renderer (shared by Search and Library modes)
// ============================================================================

interface BanksViewProps {
  query: string;
  banks: LogSearchBankKey[];
  /** Fetch even when the query is empty/short (Library browse). */
  browseWhenEmpty?: boolean;
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
  /** Render nothing (not even an empty state) until there is a usable query. */
  hideUntilQuery?: boolean;
}

function useLogSearchBanks(query: string, banks: LogSearchBankKey[], browseWhenEmpty: boolean) {
  const [sections, setSections] = useState<LogSearchSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const banksKey = banks.join(',');

  useEffect(() => {
    const trimmed = query.trim();
    const shouldFetch = trimmed.length >= 2 || (browseWhenEmpty && trimmed.length === 0);
    if (!shouldFetch) {
      setSections([]);
      setLoaded(false);
      return;
    }

    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      const resp = await logSearchService.search(trimmed, {
        banks,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setSections(resp.sections);
        setLoading(false);
        setLoaded(true);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, banksKey, browseWhenEmpty]);

  return { sections, loading, loaded };
}

function BanksView({ query, banks, browseWhenEmpty = false, onLogRecent, hideUntilQuery = false }: BanksViewProps) {
  const { sections, loading, loaded } = useLogSearchBanks(query, banks, browseWhenEmpty);

  const trimmed = query.trim();
  const hasUsableQuery = trimmed.length >= 2 || (browseWhenEmpty && trimmed.length === 0);
  if (hideUntilQuery && !hasUsableQuery) return null;

  const nonEmpty = sections.filter((s) => s.items.length > 0);

  return (
    <div className="px-6 pt-3">
      {loading && nonEmpty.length === 0 ? (
        <div className="text-brand-50/60 text-sm py-4 text-center">Searching…</div>
      ) : nonEmpty.length > 0 ? (
        <div className="rounded-2xl bg-brand-300/40 overflow-hidden">
          {nonEmpty.map((section) => (
            <div key={section.key}>
              <div className="px-4 py-2 bg-brand-900/50 text-brand-50/50 text-base font-semibold flex items-center justify-between">
                <span>{section.label}</span>
                {section.hasMore && (
                  <span className="text-brand-50/40 font-normal text-sm normal-case">
                    {section.shown} of {section.total}
                  </span>
                )}
              </div>
              {section.items.map((result) => (
                <ResultRow key={`${result.kind}-${result.id}`} result={result} onLogRecent={onLogRecent} />
              ))}
            </div>
          ))}
        </div>
      ) : loaded ? (
        <div className="text-brand-50/50 text-sm py-4 text-center">
          {trimmed.length > 0 ? `No saved meals, recipes, or recent items for “${trimmed}”` : 'No meals, recipes, or recent items yet'}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Mode tabs
// ============================================================================

const MODES: Array<{ id: LogMode; label: string }> = [
  { id: 'search', label: 'Search' },
  { id: 'library', label: 'Library' },
  { id: 'capture', label: 'Capture' },
];

export function AddToLogModeTabs({ mode, onChange }: { mode: LogMode; onChange: (mode: LogMode) => void }) {
  return (
    <div className="px-6 pt-4">
      <div className="rounded-2xl border border-brand-200/25 bg-brand-300/10 px-3">
        <div className="flex">
          {MODES.map((m) => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(m.id)}
                aria-pressed={active}
                className={`flex-1 border-b-2 py-3 text-base font-semibold transition-colors ${
                  active
                    ? 'border-brand-50 text-brand-50'
                    : 'border-brand-200/15 text-brand-50/40 hover:text-brand-50/70'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Search mode banks (meals / recipes / recent beneath food results)
// ============================================================================

export function SearchModeBanks({
  query,
  onLogRecent,
}: {
  query: string;
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
}) {
  return (
    <BanksView
      query={query}
      banks={['meals', 'recipes', 'recent']}
      onLogRecent={onLogRecent}
      hideUntilQuery
    />
  );
}

// ============================================================================
// Library mode (browseable meals / recipes / recent)
// ============================================================================

export function LibraryMode({
  onLogRecent,
}: {
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');

  return (
    <>
      <div className="px-6 pt-3">
        <input
          type="search"
          placeholder="Search your Meals, Recipes & Recent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-full bg-brand-300/40 px-5 py-3.5 text-brand-50 placeholder-brand-50/50 text-base focus:outline-none focus:ring-0"
        />
      </div>
      <BanksView
        query={query}
        banks={['meals', 'recipes', 'recent']}
        browseWhenEmpty
        onLogRecent={onLogRecent}
      />
    </>
  );
}

// ============================================================================
// Capture mode (safe placeholders)
// ============================================================================

const CAPTURE_FALLBACK: LogCaptureAction[] = [
  { id: 'scan_label', label: 'Scan Nutrition Label', available: false, endpoint: null },
  { id: 'scan_meal', label: 'Scan Meal / Photo Portion', available: false, endpoint: null },
  { id: 'barcode', label: 'Scan Barcode', available: false, endpoint: null },
  { id: 'import_recipe', label: 'Import Recipe', available: true, endpoint: '/api/journal/plans/ai/import-recipe' },
];

const CAPTURE_HINT: Record<string, string> = {
  scan_label: 'Snap a nutrition label to auto-fill items. Coming soon.',
  scan_meal: 'Estimate portions from a meal photo. Coming soon.',
  barcode: 'Scan a barcode from the search bar today; dedicated capture coming soon.',
  import_recipe: 'Import a recipe from a link or social video.',
};

export function CaptureMode({ importRecipeHref }: { importRecipeHref: string }) {
  const [actions, setActions] = useState<LogCaptureAction[]>(CAPTURE_FALLBACK);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const resp = await logSearchService.search('', { banks: ['recent'] });
    if (resp.captureActions && resp.captureActions.length > 0) {
      setActions(resp.captureActions);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="px-6 pt-4">
      <div className="grid grid-cols-1 gap-3">
        {actions.map((action) => {
          const hint = CAPTURE_HINT[action.id] ?? '';
          if (action.id === 'import_recipe' && action.available) {
            return (
              <Link
                key={action.id}
                href={importRecipeHref}
                className="flex items-center justify-between rounded-2xl border border-brand-200/40 bg-brand-300/30 px-4 py-4 transition-colors hover:bg-brand-300/50"
              >
                <span className="flex flex-col">
                  <span className="text-brand-50 font-semibold text-lg">{action.label}</span>
                  {hint && <span className="text-brand-50/55 text-sm pt-0.5">{hint}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-brand-200 px-3 py-1 text-xs font-semibold text-brand-900">
                  Open
                </span>
              </Link>
            );
          }
          return (
            <div
              key={action.id}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-brand-300/20 px-4 py-4 opacity-70"
              aria-disabled="true"
            >
              <span className="flex flex-col">
                <span className="text-brand-50/80 font-semibold text-lg">{action.label}</span>
                {hint && <span className="text-brand-50/45 text-sm pt-0.5">{hint}</span>}
              </span>
              <span className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-brand-50/45">
                Soon
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
