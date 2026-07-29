'use client';

/**
 * Food → Groceries index.
 *
 * Persistent Grocery Lists v1: shows the caller's default "My Grocery List"
 * (auto-created on first load), any named lists they've created, and their
 * recent plan-derived lists (unchanged behavior — still open in the rich
 * plan-scoped experience).
 *
 * Requires scripts/sql/addGroceryListFoundation.sql to be applied. Until
 * then, the overview call will fail — this is a review-first packet.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GeneratedGroceryList } from '@/lib/plans/types';

type LoadState = 'loading' | 'ready' | 'error';

interface Overview {
  default_list: GeneratedGroceryList;
  named_lists: GeneratedGroceryList[];
  plan_lists: GeneratedGroceryList[];
}

function formatDateRange(list: GeneratedGroceryList): string {
  if (!list.date_range_start) return 'No date range';
  if (!list.date_range_end || list.date_range_end === list.date_range_start) {
    return list.date_range_start;
  }
  return `${list.date_range_start} – ${list.date_range_end}`;
}

function ListRow({
  href,
  title,
  subtitle,
  actions,
}: {
  href: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 rounded-2xl px-1 transition-colors hover:bg-white/[0.04]">
      <Link href={href} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-50 antialiased">{title}</p>
          <p className="mt-1 text-xs text-white/45 antialiased">{subtitle}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70 antialiased">
          Open →
        </span>
      </Link>
      {actions && <div className="shrink-0 pr-2">{actions}</div>}
    </li>
  );
}

export default function FoodGroceriesIndexPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await planService.getGroceryListsOverview();
      setOverview(result);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load grocery lists.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      setCreateError('Give your list a name.');
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      await planService.createNamedGroceryList(title);
      setNewTitle('');
      setCreating(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create list.');
    } finally {
      setCreateBusy(false);
    }
  };

  const startRename = (list: GeneratedGroceryList) => {
    setRenamingId(list.id);
    setRenameValue(list.title ?? '');
  };

  const submitRename = async (listId: string) => {
    const title = renameValue.trim();
    if (!title) return;
    setRowBusyId(listId);
    try {
      await planService.renameGroceryList(listId, title);
      setRenamingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename list.');
    } finally {
      setRowBusyId(null);
    }
  };

  const handleArchive = async (list: GeneratedGroceryList) => {
    if (!window.confirm(`Archive "${list.title ?? 'this list'}"? You can\u2019t undo this from here.`)) {
      return;
    }
    setRowBusyId(list.id);
    try {
      await planService.archiveGroceryList(list.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to archive list.');
    } finally {
      setRowBusyId(null);
    }
  };

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
                  Keep a running list, create lists for trips or occasions, or open a list
                  generated from your Plans.
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

          {error && (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
              {error}
            </div>
          )}

          {loadState === 'loading' && (
            <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
                ))}
              </div>
            </section>
          )}

          {loadState === 'ready' && overview && (
            <>
              {/* My Grocery List — the persistent default */}
              <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
                <ul className="divide-y divide-white/[0.06]">
                  <ListRow
                    href={APP_ROUTE_BUILDERS.foodGroceryList(overview.default_list.id)}
                    title={overview.default_list.title?.trim() || 'My Grocery List'}
                    subtitle="Your running list · always here"
                  />
                </ul>
              </section>

              {/* Named lists */}
              <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-brand-50 antialiased">Your lists</h2>
                  {!creating && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(true);
                        setCreateError(null);
                      }}
                      className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70 antialiased hover:text-emerald-200"
                    >
                      + New list
                    </button>
                  )}
                </div>

                {creating && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        autoFocus
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreate();
                          if (e.key === 'Escape') {
                            setCreating(false);
                            setNewTitle('');
                            setCreateError(null);
                          }
                        }}
                        placeholder="e.g. Costco run, Holiday dinner"
                        className="flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-brand-50 antialiased placeholder:text-white/30 focus:border-emerald-300/50 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={createBusy}
                          onClick={handleCreate}
                          className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-50"
                        >
                          {createBusy ? 'Creating…' : 'Create'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreating(false);
                            setNewTitle('');
                            setCreateError(null);
                          }}
                          className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 antialiased hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    {createError && (
                      <p className="mt-2 text-xs text-red-300 antialiased">{createError}</p>
                    )}
                  </div>
                )}

                {overview.named_lists.length === 0 && !creating && (
                  <p className="mt-3 px-1 text-sm text-white/45 antialiased">
                    No named lists yet. Create one for a trip, occasion, or shared shop.
                  </p>
                )}

                {overview.named_lists.length > 0 && (
                  <ul className="mt-2 divide-y divide-white/[0.06]">
                    {overview.named_lists.map((list) => (
                      <li key={list.id}>
                        {renamingId === list.id ? (
                          <div className="flex items-center gap-2 px-2 py-3">
                            <input
                              autoFocus
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename(list.id);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              className="flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-brand-50 antialiased focus:border-emerald-300/50 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={rowBusyId === list.id}
                              onClick={() => submitRename(list.id)}
                              className="rounded-full bg-[#d7ecff] px-3 py-2 text-xs font-semibold text-black hover:bg-brand-50 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingId(null)}
                              className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/60 antialiased hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <ListRow
                            href={APP_ROUTE_BUILDERS.foodGroceryList(list.id)}
                            title={list.title?.trim() || 'Untitled list'}
                            subtitle={list.status === 'archived' ? 'Archived' : 'List'}
                            actions={
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={rowBusyId === list.id}
                                  onClick={() => startRename(list)}
                                  className="text-xs font-medium text-white/45 antialiased hover:text-white disabled:opacity-40"
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  disabled={rowBusyId === list.id}
                                  onClick={() => handleArchive(list)}
                                  className="text-xs font-medium text-white/45 antialiased hover:text-red-300 disabled:opacity-40"
                                >
                                  Archive
                                </button>
                              </div>
                            }
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Plan-derived lists — unchanged behavior */}
              <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
                <h2 className="px-1 text-sm font-semibold text-brand-50 antialiased">
                  From your plans
                </h2>

                {overview.plan_lists.length === 0 && (
                  <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-7 text-center">
                    <p className="text-base font-semibold text-brand-50 antialiased">
                      No plan-derived lists yet.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55 antialiased">
                      Generate one from a plan or day in Plans — it will show up here.
                    </p>
                  </div>
                )}

                {overview.plan_lists.length > 0 && (
                  <ul className="mt-2 divide-y divide-white/[0.06]">
                    {overview.plan_lists.map((list) => (
                      <ListRow
                        key={list.id}
                        href={
                          list.plan_id
                            ? `${APP_ROUTE_BUILDERS.planGrocery(list.plan_id)}?date=${list.date_range_start ?? ''}&date_end=${list.date_range_end ?? ''}`
                            : APP_ROUTES.foodGroceries
                        }
                        title={list.title?.trim() || 'Untitled grocery list'}
                        subtitle={`${formatDateRange(list)} · ${list.status}`}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
