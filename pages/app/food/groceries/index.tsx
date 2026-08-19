'use client';

/**
 * Food → Groceries — Packet 11E UX reconciliation.
 *
 * Presents two unmistakable object classes on one page:
 *   Section 1 — Grocery Lists  (persistent, evolving acquisition truth)
 *   Section 2 — Hauls          (execution objects built from a Grocery List)
 *
 * Load is GET-only. Never creates a Haul on page load.
 * Hauls section is populated only from actual canonical grocery_hauls truth.
 *
 * 11E-R1: Build a Haul routes to List detail (?action=build-haul) so the
 *   user confirms shopping_date and sees the new-object boundary explicitly.
 *   The landing card never invokes the writer directly.
 * 11E-R2: A failed listGroceryHauls() read renders a distinct error/retry
 *   state — never the "No Hauls yet" empty copy.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans/planService';
import type { GeneratedGroceryList, GroceryHaulCollectionItem } from '@/lib/plans/types';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import { resolveGroceryHaulCreateEligibility } from '@/lib/plans/groceryHaul/eligibility';
import { formatGroceryHaulStatusLabel } from '@/lib/plans/groceryHaul/copy';
import {
  GROCERIES_INDEX_TITLE,
  GROCERIES_INDEX_SUPPORTING_COPY,
  GROCERIES_INDEX_OTHER_LISTS_HEADING,
  GROCERIES_LISTS_SECTION_HEADING,
  GROCERIES_LISTS_SECTION_COPY,
  GROCERIES_HAULS_SECTION_HEADING,
  GROCERIES_HAULS_SECTION_COPY,
  GROCERIES_HAULS_EMPTY,
  formatGroceryListReadinessCopy,
  groceryListReadinessHeadline,
} from '@/lib/plans/groceryListReadiness/copy';

type LoadState = 'loading' | 'ready' | 'error';

/** Hauls section tracks a distinct unavailable state separate from the empty state (11E-R2). */
type HaulsLoadState = 'loading' | 'ready' | 'unavailable';

// ============================================================================
// Helpers
// ============================================================================

function formatShoppingDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function haulsGroupLabel(status: GroceryHaulCollectionItem['status']): 'upcoming_active' | 'recent' {
  return status === 'planned' || status === 'active' ? 'upcoming_active' : 'recent';
}

// ============================================================================
// Haul card
// ============================================================================

function HaulCard({ haul }: { haul: GroceryHaulCollectionItem }) {
  const listName = haul.source_list_name?.trim() || 'Grocery List';
  const itemLabel = `${haul.item_count} item${haul.item_count === 1 ? '' : 's'}`;
  const statusLabel = formatGroceryHaulStatusLabel(haul.status);

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 antialiased">
            {statusLabel}
          </p>
          <p className="mt-1 text-sm font-semibold text-brand-50 antialiased">
            {formatShoppingDate(haul.shopping_date)}
          </p>
          <p className="mt-1 text-xs text-white/50 antialiased">
            {itemLabel} · from {listName}
          </p>
        </div>
        <Link
          href={APP_ROUTE_BUILDERS.foodHaul(haul.id)}
          className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased"
        >
          Open Haul
        </Link>
      </div>
    </article>
  );
}

// ============================================================================
// List card
// ============================================================================

function PersistentListCard({
  list,
  summary,
  primary = false,
  badge,
}: {
  list: GeneratedGroceryList;
  summary: GroceryListReadinessDecision | undefined;
  primary?: boolean;
  badge?: string;
}) {
  const href = APP_ROUTE_BUILDERS.foodGroceryList(list.id);
  const headline = summary ? groceryListReadinessHeadline(summary.state) : null;
  const copy = summary ? formatGroceryListReadinessCopy(summary) : null;

  const eligibility = summary
    ? resolveGroceryHaulCreateEligibility({
        archivedAt: list.archived_at,
        readinessState: summary.state,
      })
    : { eligible: false as const, blockReason: 'empty_or_no_demand' as const };

  // 11E-R1: Build a Haul routes into the existing List detail where the user
  // explicitly chooses a shopping date and sees the new-object boundary.
  // ?action=build-haul signals the list detail to surface the creation affordance.
  // The landing index page never invokes the Haul writer directly.
  const buildHaulHref = eligibility.eligible
    ? `${href}?action=build-haul`
    : null;

  return (
    <article
      className={
        primary
          ? 'rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5'
          : 'rounded-2xl px-3 py-4'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className={
                primary
                  ? 'truncate text-lg font-semibold text-brand-50 antialiased'
                  : 'truncate text-sm font-semibold text-brand-50 antialiased'
              }
            >
              {list.title?.trim() || 'Untitled grocery list'}
            </h2>
            {badge && (
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/85 antialiased">
                {badge}
              </span>
            )}
          </div>
          {headline && (
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70 antialiased">
              {headline}
            </p>
          )}
          {copy && (
            <p className="mt-1 text-sm leading-relaxed text-white/65 antialiased">{copy}</p>
          )}
          {summary && summary.counts.total > 0 && (
            <p className="mt-1 text-xs text-white/40 antialiased">
              {summary.counts.pending} remaining · {summary.counts.total} on list
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {buildHaulHref && (
            <Link
              href={buildHaulHref}
              className={
                primary
                  ? 'inline-flex justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 antialiased'
                  : 'inline-flex justify-center rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-200/80 transition-colors hover:bg-emerald-500/10 antialiased'
              }
            >
              Build a Haul
            </Link>
          )}
          <Link
            href={href}
            className={
              primary
                ? 'inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50 antialiased'
                : 'inline-flex justify-center rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased'
            }
          >
            Open List
          </Link>
        </div>
      </div>
    </article>
  );
}

// ============================================================================
// Archived list row
// ============================================================================

function ArchivedListRow({
  list,
  restoringId,
  restoreError,
  onRestore,
}: {
  list: GeneratedGroceryList;
  restoringId: string | null;
  restoreError: string | null;
  onRestore: (list: GeneratedGroceryList) => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <Link
        href={APP_ROUTE_BUILDERS.foodGroceryList(list.id)}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl px-3 py-4 transition-colors hover:bg-white/[0.04]"
      >
        <p className="truncate text-sm text-white/60 antialiased">
          {list.title?.trim() || 'Untitled grocery list'}
        </p>
        <span className="shrink-0 text-xs text-white/30 antialiased">View →</span>
      </Link>
      <button
        type="button"
        disabled={!!restoringId}
        onClick={() => onRestore(list)}
        className="shrink-0 rounded-xl px-3 py-2 text-[11px] text-emerald-200/80 hover:text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50 antialiased"
      >
        {restoringId === list.id ? 'Restoring…' : 'Restore'}
      </button>
      {restoreError && restoringId === null && (
        <p className="text-xs text-red-200 antialiased">{restoreError}</p>
      )}
    </li>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function FoodGroceriesIndexPage() {
  // Lists state
  const [defaultList, setDefaultList] = useState<GeneratedGroceryList | null>(null);
  const [namedLists, setNamedLists] = useState<GeneratedGroceryList[]>([]);
  const [archivedLists, setArchivedLists] = useState<GeneratedGroceryList[]>([]);
  const [planLists, setPlanLists] = useState<GeneratedGroceryList[]>([]);
  const [summaries, setSummaries] = useState<Record<string, GroceryListReadinessDecision>>({});
  const [listsLoadState, setListsLoadState] = useState<LoadState>('loading');
  const [listsError, setListsError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Hauls state — loaded from actual canonical grocery_hauls only.
  // 11E-R2: 'unavailable' is distinct from 'ready' with an empty array.
  // Only 'ready' + hauls.length===0 renders the "No Hauls yet" empty copy.
  const [hauls, setHauls] = useState<GroceryHaulCollectionItem[]>([]);
  const [haulsLoadState, setHaulsLoadState] = useState<HaulsLoadState>('loading');
  const [haulsError, setHaulsError] = useState<string | null>(null);

  const loadHauls = useCallback(async () => {
    setHaulsLoadState('loading');
    setHaulsError(null);
    try {
      const result = await planService.listGroceryHauls();
      setHauls(result);
      setHaulsLoadState('ready');
    } catch (err) {
      // 11E-R2: non-blocking — lists remain usable, but Hauls shows an honest error.
      setHaulsError(err instanceof Error ? err.message : 'Unable to load hauls.');
      setHaulsLoadState('unavailable');
    }
  }, []);

  const load = useCallback(async () => {
    setListsLoadState('loading');
    setListsError(null);
    try {
      const overview = await planService.getGroceryListsOverview();
      setDefaultList(overview.default_list);
      setNamedLists(overview.named_lists);
      setArchivedLists(overview.archived_lists);
      setPlanLists(overview.plan_lists);
      setSummaries(overview.persistent_list_summaries ?? {});
      setListsLoadState('ready');
    } catch (err) {
      setListsError(err instanceof Error ? err.message : 'Unable to load grocery lists.');
      setListsLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
    void loadHauls();
  }, [load, loadHauls]);

  async function handleCreateList() {
    const title = newListTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      await planService.createNamedGroceryList(title);
      setNewListTitle('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create list.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(list: GeneratedGroceryList) {
    if (restoringId) return;
    setRestoringId(list.id);
    setRestoreError(null);
    try {
      await planService.unarchiveGroceryList(list.id);
      await load();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Failed to restore list.');
    } finally {
      setRestoringId(null);
    }
  }

  const upcomingActiveHauls = hauls.filter((h) => haulsGroupLabel(h.status) === 'upcoming_active');
  const recentHauls = hauls.filter((h) => haulsGroupLabel(h.status) === 'recent');

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
        <div className="mx-auto max-w-[760px] space-y-5">

          {/* ── Page header ── */}
          <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                  Food
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                  {GROCERIES_INDEX_TITLE}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                  {GROCERIES_INDEX_SUPPORTING_COPY}
                </p>
              </div>
              <Link
                href={APP_ROUTES.plans}
                className="inline-flex justify-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased"
              >
                Open Plans
              </Link>
            </div>
          </section>

          {/* ── Section 1: Grocery Lists ── */}
          <section className="rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-brand-50 antialiased">
                {GROCERIES_LISTS_SECTION_HEADING}
              </h2>
              <p className="mt-0.5 text-xs text-white/45 antialiased">
                {GROCERIES_LISTS_SECTION_COPY}
              </p>
            </div>

            {listsError && (
              <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
                {listsError}
              </div>
            )}

            {listsLoadState === 'loading' && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
                ))}
              </div>
            )}

            {listsLoadState === 'ready' && (
              <>
                {/* My Grocery List — dominant primary card */}
                {defaultList && (
                  <PersistentListCard
                    list={defaultList}
                    summary={summaries[defaultList.id]}
                    primary
                    badge="My List"
                  />
                )}

                {/* Other Lists */}
                <div className="mt-6">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-2">
                    {GROCERIES_INDEX_OTHER_LISTS_HEADING}
                  </p>
                  {namedLists.length === 0 ? (
                    <p className="text-xs text-white/40 antialiased px-1">
                      No other lists yet. Create one below for a trip, event, or household split.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/[0.06]">
                      {namedLists.map((list) => (
                        <PersistentListCard
                          key={list.id}
                          list={list}
                          summary={summaries[list.id]}
                        />
                      ))}
                    </div>
                  )}

                  {/* Create Grocery List */}
                  <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={newListTitle}
                      onChange={(e) => setNewListTitle(e.target.value)}
                      placeholder="New list name, e.g. Birthday Dinner"
                      className="flex-1 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 antialiased focus:outline-none focus:border-denim-400"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateList()}
                      disabled={creating || !newListTitle.trim()}
                      className="rounded-xl bg-denim-500/20 border border-denim-400/25 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/25 disabled:opacity-50 antialiased"
                    >
                      {creating ? 'Creating…' : '+ Create Grocery List'}
                    </button>
                  </div>
                  {createError && (
                    <p className="mt-2 text-xs text-red-200 antialiased">{createError}</p>
                  )}
                </div>

                {/* From Your Plans — visually subordinate */}
                {planLists.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-2">
                      From Your Plans
                    </p>
                    <p className="mb-2 text-xs text-white/35 antialiased">
                      Plan-derived demand to review or pull into a Grocery List.
                    </p>
                    <ul className="divide-y divide-white/[0.06]">
                      {planLists.map((list) => (
                        <li key={list.id} className="flex items-center justify-between gap-3 px-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs text-white/60 antialiased">
                              {list.title?.trim() || 'Plan grocery list'}
                            </p>
                          </div>
                          <Link
                            href={
                              list.plan_id
                                ? `${APP_ROUTE_BUILDERS.planGrocery(list.plan_id)}?date=${list.date_range_start ?? ''}&date_end=${list.date_range_end ?? ''}`
                                : APP_ROUTES.foodGroceries
                            }
                            className="shrink-0 text-xs text-white/40 hover:text-white/70 antialiased transition-colors"
                          >
                            View →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Archived Lists */}
                {archivedLists.length > 0 && (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setShowArchived((v) => !v)}
                      className="text-xs text-white/45 hover:text-white/70 antialiased"
                    >
                      {showArchived ? '▾' : '▸'} Archived Lists ({archivedLists.length})
                    </button>
                    {showArchived && (
                      <ul className="mt-2 divide-y divide-white/[0.06]">
                        {archivedLists.map((list) => (
                          <ArchivedListRow
                            key={list.id}
                            list={list}
                            restoringId={restoringId}
                            restoreError={restoreError}
                            onRestore={handleRestore}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Section 2: Hauls ── */}
          <section className="rounded-[28px] border border-white/[0.06] bg-black/10 p-4 shadow-large sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-brand-50 antialiased">
                  {GROCERIES_HAULS_SECTION_HEADING}
                </h2>
                <p className="mt-0.5 text-xs text-white/45 antialiased">
                  {GROCERIES_HAULS_SECTION_COPY}
                </p>
              </div>
              {hauls.length > 0 && (
                <Link
                  href={APP_ROUTES.foodHauls}
                  className="shrink-0 text-xs text-white/40 hover:text-white/70 antialiased transition-colors"
                >
                  View All Hauls →
                </Link>
              )}
            </div>

            {haulsLoadState === 'loading' && (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
                ))}
              </div>
            )}

            {/* 11E-R2: unavailable ≠ empty — show distinct error with retry */}
            {haulsLoadState === 'unavailable' && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <p className="text-sm text-white/45 antialiased">
                  {haulsError ?? 'Hauls unavailable.'}
                </p>
                <button
                  type="button"
                  onClick={() => void loadHauls()}
                  className="shrink-0 text-xs text-denim-300 hover:text-denim-200 antialiased transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Only render empty-state copy after a confirmed empty collection */}
            {haulsLoadState === 'ready' && hauls.length === 0 && (
              <p className="text-sm text-white/50 leading-relaxed antialiased">
                {GROCERIES_HAULS_EMPTY}
              </p>
            )}

            {haulsLoadState === 'ready' && hauls.length > 0 && (
              <div className="space-y-4">
                {upcomingActiveHauls.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-2">
                      Upcoming &amp; Active
                    </p>
                    <div className="space-y-2">
                      {upcomingActiveHauls.slice(0, 3).map((haul) => (
                        <HaulCard key={haul.id} haul={haul} />
                      ))}
                    </div>
                  </div>
                )}

                {recentHauls.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-2">
                      Recent Hauls
                    </p>
                    <div className="space-y-2">
                      {recentHauls.slice(0, 3).map((haul) => (
                        <HaulCard key={haul.id} haul={haul} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <Link
                    href={APP_ROUTES.foodHauls}
                    className="text-xs text-white/40 hover:text-white/70 antialiased transition-colors"
                  >
                    View All Hauls →
                  </Link>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
