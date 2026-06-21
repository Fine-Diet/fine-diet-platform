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
 *   - Meal / Recipe results add as ONE grouped meal journal entry, but ONLY when
 *     they resolve to a safe, supported MealDocument (see isSupportedMealResult):
 *     a confirmed document with components and a resolvable calorie total. The
 *     grouped payload is built with the existing pure lib/meals adapters and goes
 *     through the existing validated journal create path (onLogMeal). Draft /
 *     needs-review documents (e.g. imported recipes) stay disabled and labeled
 *     "Review"; anything else stays "Soon".
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
import {
  loggedMealGroupToIntakePayload,
  mealDocumentToLoggedMealGroup,
  sumComponentNutrition,
} from '@/lib/meals/adapters';
import { scaleTopLevelMealNutrition } from '@/lib/meals/recompute';
import type { GroupedMealEntryPayload, MealDocument } from '@/lib/meals/types';
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
  single_item: 'Single Item',
  full_meal: 'Full Meal',
  multi_item_meal: 'Multi-item Meal',
  recipe: 'Recipe',
};

/**
 * Compact metadata chips for a result row. Renders the three separated concepts
 * (decision 6c9dd8c2) as distinct, compact chips and never collapses them into
 * one label:
 *   - loggable shape (Single Item / Full Meal / Multi-item Meal / Recipe)
 *   - source/repository badges (Branded, Common, My Foods, Scanned, …)
 *   - library-relationship badges (Saved Meal, Recipe, Recently Logged, …)
 *
 * Chips are omitted gracefully when metadata is absent. Exported so Search-mode
 * food rows (served by /api/foods/search) reuse the exact same chip styling.
 */
export function ResultChips({
  badges,
  shape,
  className = '',
}: {
  badges: LogSearchBadge[];
  shape?: LogSearchLoggableShape;
  className?: string;
}) {
  if (!shape && badges.length === 0) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {shape && (
        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-brand-50/70">
          {LOGGABLE_SHAPE_LABEL[shape]}
        </span>
      )}
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

/**
 * Source-section badge(s) for a Search-mode food result, derived from the food
 * SectionKey. Mirrors the server adapter's source mapping (lib/logSearch/
 * adapters.ts) so food rows served by /api/foods/search — not /api/log/search —
 * still expose a compact source chip. Returns [] when the section needs no chip.
 */
export function getFoodSourceBadges(sectionKey: string): LogSearchBadge[] {
  switch (sectionKey) {
    case 'branded':
      return [{ kind: 'branded', label: 'Branded' }];
    case 'common':
      return [{ kind: 'common', label: 'Common' }];
    case 'scanned':
      return [{ kind: 'scanned', label: 'Scanned' }];
    case 'my_foods':
      return [{ kind: 'my_food', label: 'My Foods' }];
    case 'promoted_off':
    case 'off':
      return [{ kind: 'open_food_facts', label: 'Open Food Facts' }];
    default:
      return [];
  }
}

function formatKcal(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value)} cal`;
}

// ============================================================================
// Grouped meal logging (write path) — pure resolution helpers
// ============================================================================

/** The MealDocument behind a meal/recipe result, or null for other kinds. */
function resultMealDocument(result: LogSearchResult): MealDocument | null {
  if (result.kind === 'meal') return result.meal;
  if (result.kind === 'recipe') return result.recipe;
  return null;
}

/**
 * Whether a meal/recipe result can be safely added to the log as ONE grouped
 * meal entry. Only confirmed documents that have components and a resolvable
 * calorie total qualify. Draft / needs-review documents (e.g. imported recipes
 * surfaced in the recipes bank) are intentionally excluded and stay review-only,
 * matching the day-totals/NDS guarantee (mirrored top-level totals must exist).
 */
export function isSupportedMealResult(result: LogSearchResult): boolean {
  const doc = resultMealDocument(result);
  if (!doc) return false;
  if (doc.review_state !== 'confirmed') return false;
  if (doc.components.length === 0) return false;
  const totals = doc.totals ?? doc.per_serving ?? sumComponentNutrition(doc.components);
  return totals.calories != null;
}

/**
 * Build the grouped intake payload for a supported meal/recipe result using the
 * existing pure lib/meals adapters. Returns null for non-meal results or when
 * the result is not safely supported. The payload mirrors top-level
 * name/calories/macros (so existing day totals + NDS keep working) and carries
 * the canonical component list under `meal_group` (so the meal stays one grouped
 * entry instead of exploding into flat rows). This is pure: it does NOT write.
 *
 * `consumedServings` scales the logged nutrition to the portion actually eaten,
 * using the same deterministic, yield-aware scaler as the server grouped-log
 * write path (scaleTopLevelMealNutrition). This is what lets a multi-serving
 * recipe be logged as e.g. 0.5 / 2 servings instead of its whole batch:
 *   - top-level calories/macros = scaled consumed nutrition (day totals + NDS),
 *   - quantity = consumedServings (unit stays 'serving'),
 *   - meal_group records consumed_servings AND carries the consumed totals.
 * When the scaler cannot derive a safe number (it won't for supported results,
 * which are confirmed with resolvable totals) it falls back to the unscaled
 * snapshot so behavior is never worse than before.
 */
export function buildMealEntryPayload(
  result: LogSearchResult,
  consumedServings: number = 1,
): GroupedMealEntryPayload | null {
  if (!isSupportedMealResult(result)) return null;
  const doc = resultMealDocument(result);
  if (!doc) return null;

  const servings =
    Number.isFinite(consumedServings) && consumedServings > 0 ? consumedServings : 1;
  const consumedNutrition = scaleTopLevelMealNutrition(doc, servings);

  const group = mealDocumentToLoggedMealGroup(doc, { consumed_servings: servings });
  if (consumedNutrition) group.totals = consumedNutrition;

  const payload = loggedMealGroupToIntakePayload(group);
  // loggedMealGroupToIntakePayload mirrors group.totals (now the consumed
  // amount) into top-level calories/macros and fixes quantity at 1; reflect the
  // chosen portion so the entry reads as N servings.
  payload.quantity = servings;
  return payload;
}

// ============================================================================
// Result rows
// ============================================================================

/** One-tap serving multipliers for the meal/recipe log control. */
const SERVING_PRESETS = [0.5, 1, 1.5, 2] as const;

/**
 * Meal / Recipe row. Supported results (confirmed MealDocument with components +
 * totals) add as ONE grouped meal entry via onLogMeal, scaled to the chosen
 * serving portion (consumed_servings) — so a multi-serving recipe can be logged
 * as e.g. 0.5 or 2 servings rather than its whole batch. Unsupported results
 * stay disabled: needs-review/draft documents show "Review", anything else
 * "Soon".
 */
function MealRecipeRow({
  result,
  onLogMeal,
}: {
  result: LogSearchResult;
  onLogMeal: (result: LogSearchResult, consumedServings: number) => void | Promise<void>;
}) {
  const [servingsInput, setServingsInput] = useState('1');

  if (result.kind !== 'meal' && result.kind !== 'recipe') return null;
  const doc = result.kind === 'meal' ? result.meal : result.recipe;
  const isRecipe = result.kind === 'recipe';
  const componentCount = doc.components.length;
  const kcal = doc.totals?.calories ?? doc.per_serving?.calories ?? null;
  const supported = isSupportedMealResult(result);
  const reviewOnly = doc.review_state !== 'confirmed';

  const parsedServings = Number(servingsInput);
  const servingsValid = Number.isFinite(parsedServings) && parsedServings > 0;
  const servings = servingsValid ? parsedServings : 1;

  const yieldServings =
    typeof doc.recipe_yield_servings === 'number' && doc.recipe_yield_servings > 0
      ? doc.recipe_yield_servings
      : doc.yield?.servings != null && doc.yield.servings > 0
        ? doc.yield.servings
        : null;

  const info = (
    <>
      <span className="text-brand-50 font-semibold text-xl truncate">{result.title}</span>
      <span className="text-brand-50/60 text-sm pt-1 truncate">
        {componentCount} {componentCount === 1 ? 'item' : 'items'}
        {kcal != null && <> · {formatKcal(kcal)}</>}
      </span>
      <ResultChips badges={result.badges} shape={result.loggableShape} className="pt-2" />
    </>
  );

  return (
    <div
      className={`flex items-start gap-2 border-b border-brand-900/50 px-4 py-4${
        supported ? ' hover:bg-brand-400/60 transition-colors' : ''
      }`}
    >
      {supported ? (
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => void onLogMeal(result, servings)}
            className="flex w-full flex-col text-left min-w-0"
          >
            {info}
          </button>

          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-50/45">
                Servings to log
              </span>
              {isRecipe && yieldServings != null && (
                <span className="text-[11px] font-medium text-brand-50/35">
                  Recipe yields {yieldServings} {yieldServings === 1 ? 'serving' : 'servings'}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {SERVING_PRESETS.map((preset) => {
                const active = servingsValid && parsedServings === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setServingsInput(String(preset))}
                    aria-pressed={active}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100'
                        : 'border-white/15 bg-white/[0.04] text-brand-50/60 hover:bg-white/[0.08] hover:text-brand-50'
                    }`}
                  >
                    {preset === 1 ? '1' : preset}
                  </button>
                );
              })}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={servingsInput}
                onChange={(event) => setServingsInput(event.target.value)}
                aria-label="Servings to log"
                aria-invalid={!servingsValid}
                className={`w-16 rounded-lg border bg-black/20 px-2 py-1 text-xs text-brand-50 outline-none transition-colors ${
                  servingsValid
                    ? 'border-white/15 focus:border-emerald-300/50'
                    : 'border-red-400/50 focus:border-red-400/70'
                }`}
              />
              {/* Honest, read-only unit. Only `serving` is supported until saved
                  portion aliases/conversions exist (bowl, container, g, oz). */}
              <span className="text-xs font-medium text-brand-50/55">
                {servings === 1 ? 'serving' : 'servings'}
              </span>
            </div>
            {!servingsValid && (
              <span className="mt-1 block text-[11px] text-red-300">
                Enter a serving amount greater than 0.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">{info}</div>
      )}
      {supported ? (
        <button
          type="button"
          onClick={() => void onLogMeal(result, servings)}
          disabled={!servingsValid}
          className="mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-brand-50/60 hover:text-brand-50 hover:bg-brand-500/60 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label={`Add ${servings} ${servings === 1 ? 'serving' : 'servings'} to log`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      ) : (
        <span
          className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-brand-50/45"
          aria-disabled="true"
          title={
            reviewOnly
              ? 'This needs review before it can be logged'
              : 'Logging this result is coming soon'
          }
        >
          {reviewOnly ? 'Review' : 'Soon'}
        </span>
      )}
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
        <ResultChips badges={result.badges} shape={result.loggableShape} className="pt-2" />
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
  onLogMeal,
}: {
  result: LogSearchResult;
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
  onLogMeal: (result: LogSearchResult, consumedServings: number) => void | Promise<void>;
}) {
  if (result.kind === 'recent_entry') return <RecentRow result={result} onLogRecent={onLogRecent} />;
  if (result.kind === 'meal' || result.kind === 'recipe')
    return <MealRecipeRow result={result} onLogMeal={onLogMeal} />;
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
  onLogMeal: (result: LogSearchResult, consumedServings: number) => void | Promise<void>;
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

function BanksView({ query, banks, browseWhenEmpty = false, onLogRecent, onLogMeal, hideUntilQuery = false }: BanksViewProps) {
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
                <ResultRow
                  key={`${result.kind}-${result.id}`}
                  result={result}
                  onLogRecent={onLogRecent}
                  onLogMeal={onLogMeal}
                />
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
  onLogMeal,
}: {
  query: string;
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
  onLogMeal: (result: LogSearchResult, consumedServings: number) => void | Promise<void>;
}) {
  return (
    <BanksView
      query={query}
      banks={['meals', 'recipes', 'recent']}
      onLogRecent={onLogRecent}
      onLogMeal={onLogMeal}
      hideUntilQuery
    />
  );
}

// ============================================================================
// Library mode (browseable meals / recipes / recent)
// ============================================================================

export function LibraryMode({
  onLogRecent,
  onLogMeal,
}: {
  onLogRecent: (item: RecentLoggedItem) => void | Promise<void>;
  onLogMeal: (result: LogSearchResult, consumedServings: number) => void | Promise<void>;
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
        onLogMeal={onLogMeal}
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
