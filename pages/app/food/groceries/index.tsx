'use client';

/**
 * Food → Groceries — Packet 11F visual alignment.
 *
 * Visual grammar: matches /app/food, /app/plans, /app/programs.
 * - max-w-[950px] content column (not narrow dashboard)
 * - px-12 horizontal padding matching Food/Plans reference pages
 * - Open page heading (no wrapping card)
 * - Section hierarchy via scale, spacing, and selective surfaces
 * - No nested rounded-card shells as primary hierarchy mechanism
 *
 * Teaches the product model at a glance:
 *   "A List accumulates need. A Haul organizes execution."
 *
 * Section 1 — Grocery Lists  (persistent, evolving acquisition truth)
 * Section 2 — Hauls          (dated execution snapshots built from a List)
 *
 * Load is GET-only. Never creates a Haul on page load.
 * Hauls section populated only from canonical grocery_hauls truth.
 *
 * 11E-R1: Build a Haul routes to List detail (?action=build-haul).
 *   Landing page never invokes the writer directly.
 * 11E-R2: Failed listGroceryHauls() read → distinct unavailable/error state,
 *   never the "No Hauls yet" empty copy.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans/planService';
import type { GeneratedGroceryList, GroceryHaulCollectionItem } from '@/lib/plans/types';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import { resolveGroceryHaulCreateEligibility } from '@/lib/plans/groceryHaul/eligibility';
import {
  formatGroceryHaulUserFacingStatusLabel,
  formatGroceryHaulDisplayName,
} from '@/lib/plans/groceryHaul/copy';
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
import { todayLocalDateKey } from '@/lib/plans/planDateRange';

type LoadState = 'loading' | 'ready' | 'error';

/** Hauls section tracks a distinct unavailable state separate from the empty state (11E-R2). */
type HaulsLoadState = 'loading' | 'ready' | 'unavailable';

// ============================================================================
// Shared column — matches Food/Plans reference page geometry
// ============================================================================

const COLUMN = 'mx-auto w-full max-w-[950px] px-4 sm:px-6 lg:px-12';

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
// Haul card — upcoming/active
// Anatomy: derived occasion name / execution status / date · count / source List / Open Haul
// Deliberately different from List anatomy.
// ============================================================================

function HaulCard({ haul }: { haul: GroceryHaulCollectionItem }) {
  const listName = haul.source_list_name?.trim() || 'Grocery List';
  const itemLabel = `${haul.item_count} item${haul.item_count === 1 ? '' : 's'}`;
  const statusLabel = formatGroceryHaulUserFacingStatusLabel(haul.status);
  const displayName = formatGroceryHaulDisplayName(haul.shopping_date, todayLocalDateKey());

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Occasion identity — primary */}
          <p className="text-base font-semibold text-brand-50 antialiased truncate">
            {displayName}
          </p>
          {/* Execution status */}
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 antialiased">
            {statusLabel}
          </p>
          {/* Date · snapshot count */}
          <p className="mt-2.5 text-sm text-white/55 antialiased">
            {formatShoppingDate(haul.shopping_date)} · {itemLabel}
          </p>
          {/* Source List */}
          <p className="mt-0.5 text-xs text-white/35 antialiased">
            From {listName}
          </p>
        </div>
        <Link
          href={APP_ROUTE_BUILDERS.foodHaul(haul.id)}
          className="shrink-0 mt-0.5 rounded-full border border-white/15 px-4 py-1.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased"
        >
          Open Haul
        </Link>
      </div>
    </article>
  );
}

// ============================================================================
// Recent haul row — compact history
// ============================================================================

function RecentHaulRow({ haul }: { haul: GroceryHaulCollectionItem }) {
  const listName = haul.source_list_name?.trim() || 'Grocery List';
  const itemLabel = `${haul.item_count} item${haul.item_count === 1 ? '' : 's'}`;
  const statusLabel = formatGroceryHaulUserFacingStatusLabel(haul.status);
  const displayName = formatGroceryHaulDisplayName(haul.shopping_date, todayLocalDateKey());

  return (
    <li>
      <Link
        href={APP_ROUTE_BUILDERS.foodHaul(haul.id)}
        className="flex items-center justify-between gap-4 py-2.5 group"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/65 antialiased truncate">
            {displayName} · {statusLabel} · {itemLabel}
          </p>
          <p className="mt-0.5 text-xs text-white/35 antialiased">
            From {listName}
          </p>
        </div>
        <span className="shrink-0 text-sm text-white/30 group-hover:text-white/55 antialiased transition-colors">
          →
        </span>
      </Link>
    </li>
  );
}

// ============================================================================
// Primary List workspace — dominant, workspace-surface treatment
// Anatomy: name / readiness / item summary / Open List · Build a Haul
// ============================================================================

function PrimaryListCard({
  list,
  summary,
}: {
  list: GeneratedGroceryList;
  summary: GroceryListReadinessDecision | undefined;
}) {
  const href = APP_ROUTE_BUILDERS.foodGroceryList(list.id);
  const headline = summary ? groceryListReadinessHeadline(summary.state) : null;
  const copy = summary ? formatGroceryListReadinessCopy(summary) : null;
  const isEmpty = !summary || summary.state === 'empty_or_no_demand';

  const eligibility = summary
    ? resolveGroceryHaulCreateEligibility({
        archivedAt: list.archived_at,
        readinessState: summary.state,
      })
    : { eligible: false as const, blockReason: 'empty_or_no_demand' as const };

  // 11E-R1: Build a Haul routes into the existing List detail — never invokes writer directly.
  const buildHaulHref = eligibility.eligible ? `${href}?action=build-haul` : null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-5 sm:px-6 sm:py-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold text-brand-50 antialiased leading-tight truncate">
          {list.title?.trim() || 'My Grocery List'}
        </h3>
        <span className="shrink-0 mt-0.5 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 antialiased">
          My List
        </span>
      </div>

      {/* Readiness state */}
      {headline && (
        <p
          className={
            summary?.state === 'ready_to_shop'
              ? 'mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/75 antialiased'
              : summary?.state === 'needs_resolution'
              ? 'mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/65 antialiased'
              : 'mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35 antialiased'
          }
        >
          {headline}
        </p>
      )}

      {/* Empty state guidance */}
      {isEmpty ? (
        <p className="mt-2 text-sm leading-relaxed text-white/50 antialiased">
          Add items manually or bring in needs from your plans.
        </p>
      ) : (
        copy && (
          <p className="mt-1.5 text-sm leading-relaxed text-white/55 antialiased">{copy}</p>
        )
      )}

      {/* Item count summary */}
      {summary && summary.counts.total > 0 && (
        <p className="mt-1 text-xs text-white/30 antialiased">
          {summary.counts.pending} of {summary.counts.total} remaining
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        {buildHaulHref && (
          <Link
            href={buildHaulHref}
            className="inline-flex justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 antialiased"
          >
            Build a Haul
          </Link>
        )}
        <Link
          href={href}
          className={
            isEmpty && !buildHaulHref
              ? 'inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-brand-50 antialiased'
              : 'inline-flex justify-center rounded-full border border-white/15 px-4 py-1.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased'
          }
        >
          {isEmpty ? 'Add Items' : 'Open List'}
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Other List row — compact, clearly subordinate
// ============================================================================

function OtherListRow({
  list,
  summary,
}: {
  list: GeneratedGroceryList;
  summary: GroceryListReadinessDecision | undefined;
}) {
  const href = APP_ROUTE_BUILDERS.foodGroceryList(list.id);
  const headline = summary ? groceryListReadinessHeadline(summary.state) : null;

  const eligibility = summary
    ? resolveGroceryHaulCreateEligibility({
        archivedAt: list.archived_at,
        readinessState: summary.state,
      })
    : { eligible: false as const, blockReason: 'empty_or_no_demand' as const };

  const buildHaulHref = eligibility.eligible ? `${href}?action=build-haul` : null;

  return (
    <li className="flex items-center gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      {/* Identity + state */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/85 antialiased">
          {list.title?.trim() || 'Untitled grocery list'}
        </p>
        {headline && (
          <p className="mt-0.5 text-xs text-white/55 antialiased">{headline}</p>
        )}
      </div>
      {/* Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {buildHaulHref && (
          <Link
            href={buildHaulHref}
            className="text-xs text-emerald-200/65 hover:text-emerald-200 antialiased transition-colors"
          >
            Build a Haul
          </Link>
        )}
        <Link
          href={href}
          className="rounded-full border border-white/[0.16] px-3 py-1 text-xs font-semibold text-brand-50/85 transition-colors hover:bg-white/[0.05] antialiased"
        >
          Open List
        </Link>
      </div>
    </li>
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
    <li className="flex items-center gap-2 py-2">
      <Link
        href={APP_ROUTE_BUILDERS.foodGroceryList(list.id)}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 transition-colors"
      >
        <p className="truncate text-sm text-white/50 antialiased">
          {list.title?.trim() || 'Untitled grocery list'}
        </p>
        <span className="shrink-0 text-xs text-white/25 antialiased">View →</span>
      </Link>
      <button
        type="button"
        disabled={!!restoringId}
        onClick={() => onRestore(list)}
        className="shrink-0 px-2 py-1 text-xs text-emerald-200/60 hover:text-emerald-100 disabled:opacity-50 antialiased"
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

  // Hauls state — loaded from canonical grocery_hauls only.
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
      // 11E-R2: non-blocking — lists remain usable; Hauls shows honest error.
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
      <main className="flex-1 overflow-y-auto pb-28">

        {/* ── Page header — open canvas, no wrapping card ── */}
        <div className="pt-10 sm:pt-12 pb-8 px-4 sm:px-6 lg:px-12">
          <div className={COLUMN}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[1.1rem] font-semibold text-white antialiased">Food</p>
                <h1 className="mt-1 text-[2.5rem] sm:text-[2.75rem] font-regular leading-[1] tracking-tight text-white antialiased">
                  {GROCERIES_INDEX_TITLE}
                </h1>
                <p className="mt-2 text-base font-light leading-relaxed text-white/55 antialiased max-w-xl">
                  {GROCERIES_INDEX_SUPPORTING_COPY}
                </p>
              </div>
              <Link
                href={APP_ROUTES.plans}
                className="shrink-0 mb-1 rounded-full border border-white/15 px-4 py-1.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased"
              >
                Open Plans
              </Link>
            </div>
          </div>
        </div>

        {/* Divider — matches Food/Plans section rhythm */}
        <div className="border-t border-white/[0.06]" />

        {/* ── Section 1: Grocery Lists — open section, no wrapping card ── */}
        <div className="pt-8 pb-6 px-4 sm:px-6 lg:px-12">
          <div className={COLUMN}>

            {/* Section heading */}
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-brand-50 antialiased">
                  {GROCERIES_LISTS_SECTION_HEADING}
                </h2>
                <p className="mt-0.5 text-sm text-white/45 antialiased">
                  {GROCERIES_LISTS_SECTION_COPY}
                </p>
              </div>
            </div>

            {listsError && (
              <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
                {listsError}
              </div>
            )}

            {listsLoadState === 'loading' && (
              <div className="space-y-4">
                <div className="h-28 animate-pulse rounded-2xl bg-white/[0.03]" />
                <div className="h-10 animate-pulse rounded-xl bg-white/[0.02]" />
                <div className="h-10 animate-pulse rounded-xl bg-white/[0.02]" />
              </div>
            )}

            {listsLoadState === 'ready' && (
              <div className="space-y-6">
                {/* My Grocery List — primary workspace */}
                {defaultList && (
                  <PrimaryListCard
                    list={defaultList}
                    summary={summaries[defaultList.id]}
                  />
                )}

                {/* Other Lists — compact rows */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/35 antialiased">
                    {GROCERIES_INDEX_OTHER_LISTS_HEADING}
                  </p>
                  {namedLists.length === 0 ? (
                    <p className="text-sm text-white/35 antialiased">
                      Create another Grocery List for an event, household need, or separate shopping purpose.
                    </p>
                  ) : (
                    <ul>
                      {namedLists.map((list) => (
                        <OtherListRow
                          key={list.id}
                          list={list}
                          summary={summaries[list.id]}
                        />
                      ))}
                    </ul>
                  )}

                  {/* Create Grocery List — inline row, no nested card */}
                  <div className="mt-4 flex items-center gap-3">
                    <input
                      type="text"
                      value={newListTitle}
                      onChange={(e) => setNewListTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateList(); }}
                      placeholder="New list name, e.g. Birthday Dinner"
                      className="flex-1 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 antialiased focus:outline-none focus:border-denim-400/60 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateList()}
                      disabled={creating || !newListTitle.trim()}
                      className={
                        newListTitle.trim()
                          ? 'shrink-0 rounded-xl border border-denim-400/30 bg-denim-500/20 px-3 py-2 text-sm font-semibold text-denim-100 hover:bg-denim-500/30 antialiased transition-colors'
                          : 'shrink-0 rounded-xl border border-white/[0.08] bg-transparent px-3 py-2 text-sm text-white/35 antialiased cursor-text'
                      }
                    >
                      {creating ? 'Creating…' : '+ Create Grocery List'}
                    </button>
                  </div>
                  {createError && (
                    <p className="mt-2 text-xs text-red-200 antialiased">{createError}</p>
                  )}
                </div>

                {/* From Your Plans — subordinate source rows */}
                {planLists.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/40 antialiased">
                      From Your Plans
                    </p>
                    <p className="mb-2 text-xs text-white/40 antialiased">
                      Plan-generated demand you can review or add to a Grocery List.
                    </p>
                    <ul className="divide-y divide-white/[0.04]">
                      {planLists.map((list) => (
                        <li key={list.id} className="flex items-center justify-between gap-3 py-2">
                          <p className="truncate text-xs text-white/55 antialiased">
                            {list.title?.trim() || 'Plan grocery list'}
                          </p>
                          <Link
                            href={
                              list.plan_id
                                ? `${APP_ROUTE_BUILDERS.planGrocery(list.plan_id)}?date=${list.date_range_start ?? ''}&date_end=${list.date_range_end ?? ''}`
                                : APP_ROUTES.foodGroceries
                            }
                            className="shrink-0 text-xs text-white/45 hover:text-white/70 antialiased transition-colors"
                          >
                            View →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Archived Lists — collapsed, quiet */}
                {archivedLists.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowArchived((v) => !v)}
                      className="text-xs text-white/30 hover:text-white/50 antialiased"
                    >
                      {showArchived ? '▾' : '▸'} Archived Lists ({archivedLists.length})
                    </button>
                    {showArchived && (
                      <ul className="mt-2 divide-y divide-white/[0.04]">
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
              </div>
            )}
          </div>
        </div>

        {/* Divider before Hauls section */}
        <div className="border-t border-white/[0.06]" />

        {/* ── Section 2: Hauls — peer section, not a footer widget ── */}
        <div className="pt-8 pb-10 px-4 sm:px-6 lg:px-12">
          <div className={COLUMN}>

            {/* Section heading */}
            <div className="mb-6 flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-brand-50 antialiased">
                  {GROCERIES_HAULS_SECTION_HEADING}
                </h2>
                <p className="mt-0.5 text-sm text-white/45 antialiased">
                  {GROCERIES_HAULS_SECTION_COPY}
                </p>
              </div>
              {/* View All Hauls — present once hauls successfully loaded */}
              {haulsLoadState === 'ready' && (
                <Link
                  href={APP_ROUTES.foodHauls}
                  className="shrink-0 text-sm text-white/40 hover:text-white/65 antialiased transition-colors"
                >
                  View All Hauls →
                </Link>
              )}
            </div>

            {haulsLoadState === 'loading' && (
              <div className="space-y-3">
                <div className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" />
                <div className="h-8 animate-pulse rounded-xl bg-white/[0.02]" />
              </div>
            )}

            {/* 11E-R2: unavailable ≠ empty — distinct error + retry */}
            {haulsLoadState === 'unavailable' && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-3">
                <p className="text-sm text-white/40 antialiased">
                  {haulsError ?? 'Hauls unavailable.'}
                </p>
                <button
                  type="button"
                  onClick={() => void loadHauls()}
                  className="shrink-0 text-sm text-denim-300 hover:text-denim-200 antialiased transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Only render empty state after confirmed empty canonical read */}
            {haulsLoadState === 'ready' && hauls.length === 0 && (
              <p className="text-sm text-white/45 leading-relaxed antialiased max-w-lg">
                {GROCERIES_HAULS_EMPTY}
              </p>
            )}

            {haulsLoadState === 'ready' && hauls.length > 0 && (
              <div className="space-y-6">
                {/* Upcoming & Active — full cards */}
                {upcomingActiveHauls.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/35 antialiased">
                      Upcoming &amp; Active
                    </p>
                    <div className="space-y-3">
                      {upcomingActiveHauls.slice(0, 3).map((haul) => (
                        <HaulCard key={haul.id} haul={haul} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Hauls — compact rows */}
                {recentHauls.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/35 antialiased">
                      Recent Hauls
                    </p>
                    <ul className="divide-y divide-white/[0.05]">
                      {recentHauls.slice(0, 4).map((haul) => (
                        <RecentHaulRow key={haul.id} haul={haul} />
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <Link
                    href={APP_ROUTES.foodHauls}
                    className="text-sm text-white/35 hover:text-white/60 antialiased transition-colors"
                  >
                    View All Hauls →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

      </main>

      <JournalFooterNav />
    </div>
  );
}
