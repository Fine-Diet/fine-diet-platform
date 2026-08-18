'use client';

/**
 * Food → Groceries index — Packet 11D navigation reconciliation.
 *
 * Communicates Grocery List → Ready to shop → Shopping trip using Packet 10
 * readiness on active persistent lists. Index CTAs always open list detail.
 * Load is GET-only and never creates a Haul.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GeneratedGroceryList } from '@/lib/plans/types';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import {
  GROCERIES_INDEX_OTHER_LISTS_HEADING,
  GROCERIES_INDEX_PROGRESSION,
  GROCERIES_INDEX_SUPPORTING_COPY,
  GROCERIES_INDEX_TITLE,
  formatGroceryListReadinessCopy,
  groceryListReadinessHeadline,
  groceryListReadinessIndexCtaLabel,
} from '@/lib/plans/groceryListReadiness/copy';

type LoadState = 'loading' | 'ready' | 'error';

function formatDateRange(list: GeneratedGroceryList): string {
  if (!list.date_range_start) return 'No date range';
  if (!list.date_range_end || list.date_range_end === list.date_range_start) {
    return list.date_range_start;
  }
  return `${list.date_range_start} – ${list.date_range_end}`;
}

function ListRow({
  list,
  href,
  badge,
  trailing,
}: {
  list: GeneratedGroceryList;
  href: string;
  badge?: string;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl px-3 py-4 transition-colors hover:bg-white/[0.04]"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-brand-50 antialiased">
              {list.title?.trim() || 'Untitled grocery list'}
            </p>
            {badge && (
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/85 antialiased">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-white/45 antialiased">
            {formatDateRange(list)} · {list.status}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70 antialiased">
          Open →
        </span>
      </Link>
      {trailing}
    </li>
  );
}

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
  const cta = summary ? groceryListReadinessIndexCtaLabel(summary.state) : 'Open list';

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
        <Link
          href={href}
          className={
            primary
              ? 'inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50'
              : 'inline-flex justify-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04]'
          }
        >
          {cta}
        </Link>
      </div>
    </article>
  );
}

export default function FoodGroceriesIndexPage() {
  const [defaultList, setDefaultList] = useState<GeneratedGroceryList | null>(null);
  const [namedLists, setNamedLists] = useState<GeneratedGroceryList[]>([]);
  const [archivedLists, setArchivedLists] = useState<GeneratedGroceryList[]>([]);
  const [planLists, setPlanLists] = useState<GeneratedGroceryList[]>([]);
  const [summaries, setSummaries] = useState<Record<string, GroceryListReadinessDecision>>({});
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const overview = await planService.getGroceryListsOverview();
      setDefaultList(overview.default_list);
      setNamedLists(overview.named_lists);
      setArchivedLists(overview.archived_lists);
      setPlanLists(overview.plan_lists);
      setSummaries(overview.persistent_list_summaries ?? {});
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load grocery lists.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
        <div className="mx-auto max-w-[760px]">
          <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                  {GROCERIES_INDEX_TITLE}
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                  {GROCERIES_INDEX_TITLE}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                  {GROCERIES_INDEX_SUPPORTING_COPY}
                </p>
                <p className="mt-2 text-xs text-white/40 antialiased">{GROCERIES_INDEX_PROGRESSION}</p>
              </div>
              <Link
                href={APP_ROUTES.plans}
                className="inline-flex justify-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04]"
              >
                Open Plans
              </Link>
            </div>
          </section>

          <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
            {error && (
              <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
                {error}
              </div>
            )}

            {loadState === 'loading' && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
                ))}
              </div>
            )}

            {loadState === 'ready' && (
              <>
                {defaultList && (
                  <PersistentListCard
                    list={defaultList}
                    summary={summaries[defaultList.id]}
                    primary
                    badge="Default"
                  />
                )}

                <div className="mt-6">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-2">
                    {GROCERIES_INDEX_OTHER_LISTS_HEADING}
                  </p>
                  {namedLists.length === 0 ? (
                    <p className="text-xs text-white/40 antialiased px-1">
                      No named lists yet. Create one below for a trip, event, or household split —
                      My Grocery List stays your default running list.
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
                      {creating ? 'Creating…' : 'Create list'}
                    </button>
                  </div>
                  {createError && (
                    <p className="mt-2 text-xs text-red-200 antialiased">{createError}</p>
                  )}
                </div>

                {planLists.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-2">
                      From your plans
                    </p>
                    <ul className="divide-y divide-white/[0.06]">
                      {planLists.map((list) => (
                        <ListRow
                          key={list.id}
                          list={list}
                          href={
                            list.plan_id
                              ? `${APP_ROUTE_BUILDERS.planGrocery(list.plan_id)}?date=${list.date_range_start ?? ''}&date_end=${list.date_range_end ?? ''}`
                              : APP_ROUTES.foodGroceries
                          }
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {archivedLists.length > 0 && (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setShowArchived((v) => !v)}
                      className="text-xs text-white/45 hover:text-white/70 antialiased"
                    >
                      {showArchived ? '▾' : '▸'} Archived lists ({archivedLists.length})
                    </button>
                    {showArchived && (
                      <>
                        <ul className="mt-2 divide-y divide-white/[0.06]">
                          {archivedLists.map((list) => (
                            <ListRow
                              key={list.id}
                              list={list}
                              href={APP_ROUTE_BUILDERS.foodGroceryList(list.id)}
                              trailing={
                                <button
                                  type="button"
                                  disabled={!!restoringId}
                                  onClick={() => void handleRestore(list)}
                                  className="shrink-0 rounded-xl px-3 py-2 text-[11px] text-emerald-200/80 hover:text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50 antialiased"
                                >
                                  {restoringId === list.id ? 'Restoring…' : 'Restore'}
                                </button>
                              }
                            />
                          ))}
                        </ul>
                        {restoreError && (
                          <p className="mt-2 text-xs text-red-200 antialiased">{restoreError}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
