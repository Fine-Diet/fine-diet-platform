'use client';

/**
 * Food → Groceries index — Persistent Grocery Lists v1.
 *
 * Shows the default "My Grocery List" first, then named lists, then
 * read-only plan-derived lists from the existing generation workflow, with
 * archived lists tucked behind a secondary toggle.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GeneratedGroceryList } from '@/lib/plans/types';

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
}: {
  list: GeneratedGroceryList;
  href: string;
  badge?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded-2xl px-3 py-4 transition-colors hover:bg-white/[0.04]"
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
    </li>
  );
}

export default function FoodGroceriesIndexPage() {
  const [defaultList, setDefaultList] = useState<GeneratedGroceryList | null>(null);
  const [namedLists, setNamedLists] = useState<GeneratedGroceryList[]>([]);
  const [archivedLists, setArchivedLists] = useState<GeneratedGroceryList[]>([]);
  const [planLists, setPlanLists] = useState<GeneratedGroceryList[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const overview = await planService.getGroceryListsOverview();
      setDefaultList(overview.default_list);
      setNamedLists(overview.named_lists);
      setArchivedLists(overview.archived_lists);
      setPlanLists(overview.plan_lists);
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

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
        <div className="mx-auto max-w-[760px]">
          <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                  Groceries
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                  Your grocery lists
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                  My Grocery List runs continuously across everything you plan. Add your own
                  named lists, or open a plan or day in Plans to add its needs here.
                </p>
              </div>
              <Link
                href={APP_ROUTES.plans}
                className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
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
                <ul className="divide-y divide-white/[0.06]">
                  {defaultList && (
                    <ListRow
                      list={defaultList}
                      href={APP_ROUTE_BUILDERS.foodGroceryList(defaultList.id)}
                      badge="Default"
                    />
                  )}
                  {namedLists.map((list) => (
                    <ListRow key={list.id} list={list} href={APP_ROUTE_BUILDERS.foodGroceryList(list.id)} />
                  ))}
                </ul>

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
                      <ul className="mt-2 divide-y divide-white/[0.06]">
                        {archivedLists.map((list) => (
                          <ListRow key={list.id} list={list} href={APP_ROUTE_BUILDERS.foodGroceryList(list.id)} />
                        ))}
                      </ul>
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
