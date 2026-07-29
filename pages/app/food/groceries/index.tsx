'use client';

/**
 * Food → Groceries index (Packet: FD-PLATFORM food-architecture-v1).
 *
 * Lists a person's existing plan-derived grocery lists. The persistent
 * "My Grocery List" default + user-named lists (independent of any plan)
 * ship once scripts/sql/addGroceryListFoundation.sql is applied — this page
 * is written to grow into that without a rewrite: it already lists by
 * owner-agnostic query and links each row to its detail via
 * APP_ROUTE_BUILDERS.planGrocery, which itself now resolves under Food.
 */

import { useEffect, useState } from 'react';
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

export default function FoodGroceriesIndexPage() {
  const [lists, setLists] = useState<GeneratedGroceryList[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await planService.listGroceryLists();
        if (cancelled) return;
        setLists(result);
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load grocery lists.');
        setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
                  Lists generated from your plans. Open a plan or day in Plans to generate a
                  new list, or open an existing one below.
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

            {loadState === 'ready' && lists.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-7 text-center">
                <p className="text-base font-semibold text-brand-50 antialiased">
                  No grocery lists yet.
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55 antialiased">
                  Generate one from a plan or day in Plans — it will show up here.
                </p>
              </div>
            )}

            {loadState === 'ready' && lists.length > 0 && (
              <ul className="divide-y divide-white/[0.06]">
                {lists.map((list) => (
                  <li key={list.id}>
                    <Link
                      href={
                        list.plan_id
                          ? `${APP_ROUTE_BUILDERS.planGrocery(list.plan_id)}?date=${list.date_range_start ?? ''}&date_end=${list.date_range_end ?? ''}`
                          : APP_ROUTES.foodGroceries
                      }
                      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-4 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-brand-50 antialiased">
                          {list.title?.trim() || 'Untitled grocery list'}
                        </p>
                        <p className="mt-1 text-xs text-white/45 antialiased">
                          {formatDateRange(list)} · {list.status}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70 antialiased">
                        Open →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
