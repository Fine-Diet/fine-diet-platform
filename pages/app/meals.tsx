'use client';

/**
 * Meal Object Foundation — Packet 7: Minimal Meal Library surface (/app/meals).
 *
 * The first user-facing home for reusable meals and recipes. It is a READ-ONLY
 * browse/search surface over the caller's MealDocuments, backed exclusively by
 * the P6 endpoint:
 *
 *   GET /api/journal/meals/documents/search?q=&mode=&review_state=&limit=
 *
 * SCOPE / SAFETY:
 *   - This page never mutates meal_documents. Cards and the expandable preview
 *     are read-only projections of the P6 search results.
 *   - It calls the MealDocument search endpoint, NOT /api/foods/search. Branded
 *     food search is left entirely untouched.
 *   - Recipes are a filter inside the library, not a separate silo.
 *   - "Add meal" is a disabled placeholder; "Import recipe" links to the
 *     existing import surface. No new capture/parser/editor flows are added.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type {
  MealComponent,
  MealDocumentIntent,
  MealDocumentKind,
  MealNutrition,
  MealReviewState,
  MealStep,
} from '@/lib/meals/types';

type LoadState = 'loading' | 'ready' | 'error';

type LibraryFilter = 'all' | 'meals' | 'recipes' | 'needs_review';

/** Local mirror of the P6 `MealDocumentSearchResult` (client-safe; the search
 *  service module is server-only, so we do not import from it here). */
interface MealDocumentSearchResult {
  type: 'meal_document';
  document_kind: MealDocumentKind;
  id: string;
  person_id: string;
  title: string;
  description: string | null;
  review_state: MealReviewState;
  source_type: string | null;
  intents: MealDocumentIntent[];
  nutrition: MealNutrition | null;
  /** Optional component/step detail — not part of the P6 list projection, but
   *  the card preview renders it defensively if a future endpoint supplies it. */
  components?: MealComponent[] | null;
  steps?: MealStep[] | null;
  updated_at: string | null;
}

interface MealDocumentSearchOutcome {
  mode: string;
  query: string;
  kind: MealDocumentKind | null;
  browse: boolean;
  limit: number;
  results: MealDocumentSearchResult[];
}

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'meals', label: 'Meals' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'needs_review', label: 'Needs review' },
];

const SEARCH_LIMIT = 50;

/** Map a library filter to the P6 query params (mode + optional review_state). */
function paramsForFilter(filter: LibraryFilter): { mode: string; review_state?: string } {
  switch (filter) {
    case 'meals':
      return { mode: 'meals' };
    case 'recipes':
      return { mode: 'recipes' };
    case 'needs_review':
      return { mode: 'all', review_state: 'needs_review' };
    case 'all':
    default:
      return { mode: 'all' };
  }
}

function kindLabel(kind: MealDocumentKind): string {
  return kind === 'recipe' ? 'Recipe' : 'Meal';
}

function reviewStateLabel(state: MealReviewState): string {
  switch (state) {
    case 'needs_review':
      return 'Needs review';
    case 'draft':
      return 'Draft';
    case 'confirmed':
    default:
      return 'Confirmed';
  }
}

function sourceLabel(sourceType: string | null): string | null {
  if (!sourceType) return null;
  const cleaned = sourceType.replace(/_/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatUpdated(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function roundedGrams(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${Math.round(value)} g`;
}

/** Compact per-serving nutrition summary, or null when nothing is known. */
function nutritionSummary(nutrition: MealNutrition | null): string | null {
  if (!nutrition) return null;
  const parts: string[] = [];
  if (typeof nutrition.calories === 'number' && Number.isFinite(nutrition.calories)) {
    parts.push(`${Math.round(nutrition.calories)} kcal`);
  }
  const protein = roundedGrams(nutrition.macros?.protein_g);
  const carbs = roundedGrams(nutrition.macros?.carbs_g);
  const fat = roundedGrams(nutrition.macros?.fat_g);
  if (protein) parts.push(`P ${protein}`);
  if (carbs) parts.push(`C ${carbs}`);
  if (fat) parts.push(`F ${fat}`);
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

function CardsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4"
        >
          <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-1/4 animate-pulse rounded-full bg-white/10" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function ReviewBadge({ state }: { state: MealReviewState }) {
  const tone =
    state === 'needs_review'
      ? 'border-amber-300/25 bg-amber-500/15 text-amber-100'
      : state === 'draft'
        ? 'border-white/15 bg-white/[0.06] text-white/70'
        : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold antialiased ${tone}`}
    >
      {reviewStateLabel(state)}
    </span>
  );
}

function MealDocumentCard({
  doc,
  expanded,
  onToggle,
}: {
  doc: MealDocumentSearchResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const nutrition = nutritionSummary(doc.nutrition);
  const source = sourceLabel(doc.source_type);
  const updated = formatUpdated(doc.updated_at);
  const isRecipe = doc.document_kind === 'recipe';
  const components = doc.components ?? [];
  const steps = doc.steps ?? [];

  return (
    <article className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4 transition-colors hover:border-white/[0.12]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="block w-full text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold antialiased ${
                  isRecipe
                    ? 'border-sky-300/25 bg-sky-500/10 text-sky-100'
                    : 'border-violet-300/25 bg-violet-500/10 text-violet-100'
                }`}
              >
                {kindLabel(doc.document_kind)}
              </span>
              <ReviewBadge state={doc.review_state} />
              {source && (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-white/60 antialiased">
                  {source}
                </span>
              )}
            </div>
            <h3 className="mt-2 truncate text-base font-semibold text-brand-50 antialiased">
              {doc.title || 'Untitled'}
            </h3>
            {nutrition ? (
              <p className="mt-1 text-sm text-emerald-100/80 antialiased">
                {nutrition}
                <span className="text-white/40"> per serving</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/35 antialiased">
                Nutrition not available
              </p>
            )}
            {updated && (
              <p className="mt-2 text-xs text-white/40 antialiased">Updated {updated}</p>
            )}
          </div>
          <span
            className="mt-1 shrink-0 text-xs font-semibold text-white/45 antialiased"
            aria-hidden
          >
            {expanded ? 'Hide' : 'Details'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          {doc.description && (
            <p className="text-sm leading-relaxed text-white/65 antialiased">
              {doc.description}
            </p>
          )}

          {doc.nutrition && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetailMetric
                label="Calories"
                value={
                  typeof doc.nutrition.calories === 'number'
                    ? `${Math.round(doc.nutrition.calories)}`
                    : '—'
                }
              />
              <DetailMetric label="Protein" value={roundedGrams(doc.nutrition.macros?.protein_g) ?? '—'} />
              <DetailMetric label="Carbs" value={roundedGrams(doc.nutrition.macros?.carbs_g) ?? '—'} />
              <DetailMetric label="Fat" value={roundedGrams(doc.nutrition.macros?.fat_g) ?? '—'} />
            </div>
          )}

          {doc.intents.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {doc.intents.map((intent) => (
                <span
                  key={intent}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white/55 antialiased"
                >
                  {intent}
                </span>
              ))}
            </div>
          )}

          {components.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Components
              </p>
              <ul className="mt-2 space-y-1">
                {components.map((component) => (
                  <li
                    key={component.component_id}
                    className="flex items-baseline justify-between gap-3 text-sm text-white/70 antialiased"
                  >
                    <span className="min-w-0 truncate">{component.name}</span>
                    {component.quantity != null && (
                      <span className="shrink-0 text-white/45">
                        {component.quantity}
                        {component.unit ? ` ${component.unit}` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Instructions
              </p>
              <ol className="mt-2 space-y-2">
                {[...steps]
                  .sort((a, b) => a.step_number - b.step_number)
                  .map((step) => (
                    <li
                      key={step.step_number}
                      className="flex gap-3 text-sm leading-relaxed text-white/70 antialiased"
                    >
                      <span className="shrink-0 font-semibold text-white/40">
                        {step.step_number}.
                      </span>
                      <span>{step.instruction}</span>
                    </li>
                  ))}
              </ol>
            </div>
          )}

          {!doc.description &&
            !doc.nutrition &&
            doc.intents.length === 0 &&
            components.length === 0 &&
            steps.length === 0 && (
              <p className="text-sm text-white/40 antialiased">
                No additional details available for this {kindLabel(doc.document_kind).toLowerCase()}.
              </p>
            )}
        </div>
      )}
    </article>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-sm font-semibold text-brand-50 antialiased">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-white/45 antialiased">{label}</p>
    </div>
  );
}

export default function MealLibraryPage() {
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<MealDocumentSearchResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce the title search input so each keystroke does not hit the endpoint.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const loadDocuments = useCallback(
    async (signal?: AbortSignal) => {
      setLoadState('loading');
      setError(null);
      try {
        const { mode, review_state } = paramsForFilter(filter);
        const params = new URLSearchParams({ mode, limit: String(SEARCH_LIMIT) });
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (review_state) params.set('review_state', review_state);

        const res = await fetch(
          `/api/journal/meals/documents/search?${params.toString()}`,
          { credentials: 'include', signal },
        );
        if (!res.ok) {
          throw new Error(`Meal library search failed (${res.status}).`);
        }
        const body = (await res.json()) as MealDocumentSearchOutcome;
        if (signal?.aborted) return;
        setResults(Array.isArray(body.results) ? body.results : []);
        setLoadState('ready');
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Unable to load your meal library.');
        setLoadState('error');
      }
    },
    [filter, debouncedQuery],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadDocuments(controller.signal);
    return () => controller.abort();
  }, [loadDocuments]);

  // Collapse any open preview when the result set changes underneath it.
  const retryRef = useRef(loadDocuments);
  retryRef.current = loadDocuments;

  const countLabel = useMemo(() => {
    if (loadState !== 'ready') return '';
    if (results.length === 1) return '1 item';
    return `${results.length} items`;
  }, [loadState, results.length]);

  const emptyCopy = useMemo(() => {
    if (debouncedQuery) {
      return {
        title: 'No matches',
        body: `Nothing in your Meal Library matches "${debouncedQuery}". Try a different title or clear your search.`,
      };
    }
    switch (filter) {
      case 'recipes':
        return {
          title: 'No recipes yet',
          body: 'Recipes you import or save will appear here. Use "Import recipe" to add your first one.',
        };
      case 'meals':
        return {
          title: 'No meals yet',
          body: 'Reusable meals you save will appear here, ready to log or plan again.',
        };
      case 'needs_review':
        return {
          title: 'Nothing needs review',
          body: 'Imported or incomplete items that need your confirmation will show up here.',
        };
      case 'all':
      default:
        return {
          title: 'Your Meal Library is empty',
          body: 'Find, save, and reuse meals and recipes here. Import a recipe to get started.',
        };
    }
  }, [filter, debouncedQuery]);

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
        <div className="mx-auto max-w-[760px]">
          <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                  Meal Library
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                  Recipes &amp; reusable meals
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                  Find and search the meals and recipes you have saved. Recipes are a filter
                  here, not a separate place. This view is read-only for now.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={APP_ROUTES.planImportNew}
                  className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
                >
                  Import recipe
                </Link>
                <button
                  type="button"
                  disabled
                  title="Saving new meals from the library is coming soon."
                  className="inline-flex cursor-not-allowed justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/40"
                >
                  Add meal
                </button>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
            <div className="flex flex-col gap-4">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title..."
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors placeholder:text-white/30 focus:border-emerald-300/50"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((option) => {
                    const isActive = filter === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setFilter(option.id)}
                        aria-pressed={isActive}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold antialiased transition-colors ${
                          isActive
                            ? 'bg-brand-50 text-black'
                            : 'border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {countLabel && (
                  <span className="text-xs text-white/40 antialiased">{countLabel}</span>
                )}
              </div>
            </div>

            <div className="mt-5">
              {loadState === 'loading' && <CardsSkeleton />}

              {loadState === 'error' && (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
                  <p className="text-sm font-semibold text-brand-50 antialiased">
                    Meal Library could not load.
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-white/55 antialiased">
                    {error ?? 'Something went wrong. Please try again.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void retryRef.current()}
                    className="mt-4 rounded-full border border-white/10 px-4 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    Try again
                  </button>
                </div>
              )}

              {loadState === 'ready' && results.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-7 text-center">
                  <p className="text-base font-semibold text-brand-50 antialiased">
                    {emptyCopy.title}
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55 antialiased">
                    {emptyCopy.body}
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Link
                      href={APP_ROUTES.planImportNew}
                      className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50"
                    >
                      Import recipe
                    </Link>
                  </div>
                </div>
              )}

              {loadState === 'ready' && results.length > 0 && (
                <div className="space-y-3">
                  {results.map((doc) => (
                    <MealDocumentCard
                      key={doc.id}
                      doc={doc}
                      expanded={expandedId === doc.id}
                      onToggle={() =>
                        setExpandedId((current) => (current === doc.id ? null : doc.id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
