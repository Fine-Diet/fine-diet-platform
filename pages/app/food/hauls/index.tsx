'use client';

/**
 * Food → Hauls — Packet 11E read-only collection/history surface.
 *
 * Exposes actual canonical Hauls grouped by status. Routes into
 * /app/food/hauls/[haulId] for detail.
 *
 * This page is an execution/history surface — not a Grocery List editor.
 * No List resolution, Pantry management, retailer config, cart, receipt,
 * or contribution editing belongs here.
 *
 * Load is GET-only and never creates or mutates a Haul.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans/planService';
import type { GroceryHaulCollectionItem } from '@/lib/plans/types';
import { formatGroceryHaulStatusLabel } from '@/lib/plans/groceryHaul/copy';
import { HAULS_INDEX_TITLE, HAULS_INDEX_SUPPORTING_COPY } from '@/lib/plans/groceryListReadiness/copy';

type LoadState = 'loading' | 'ready' | 'error';

// ============================================================================
// Helpers
// ============================================================================

function formatShoppingDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOpenStatus(status: GroceryHaulCollectionItem['status']): boolean {
  return status === 'planned' || status === 'active';
}

// ============================================================================
// Haul row
// ============================================================================

function HaulRow({ haul }: { haul: GroceryHaulCollectionItem }) {
  const listName = haul.source_list_name?.trim() || 'Grocery List';
  const itemLabel = `${haul.item_count} item${haul.item_count === 1 ? '' : 's'}`;

  return (
    <li>
      <Link
        href={APP_ROUTE_BUILDERS.foodHaul(haul.id)}
        className="flex items-start justify-between gap-4 rounded-2xl px-3 py-4 transition-colors hover:bg-white/[0.04]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-brand-50 antialiased">
              {formatShoppingDate(haul.shopping_date)}
            </p>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/50 antialiased">
              {formatGroceryHaulStatusLabel(haul.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/45 antialiased">
            {itemLabel} · from {listName}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-white/40 antialiased">
          Open →
        </span>
      </Link>
    </li>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function FoodHaulsIndexPage() {
  const [hauls, setHauls] = useState<GroceryHaulCollectionItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const result = await planService.listGroceryHauls();
      setHauls(result);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load hauls.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openHauls = hauls.filter((h) => isOpenStatus(h.status));
  const historicalHauls = hauls.filter((h) => !isOpenStatus(h.status));

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
        <div className="mx-auto max-w-[760px] space-y-5">

          {/* ── Page header ── */}
          <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                  Food
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                  {HAULS_INDEX_TITLE}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                  {HAULS_INDEX_SUPPORTING_COPY}
                </p>
              </div>
              <Link
                href={APP_ROUTES.foodGroceries}
                className="inline-flex justify-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased"
              >
                Grocery Lists
              </Link>
            </div>
          </section>

          {/* ── Hauls list ── */}
          <section className="rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
            {error && (
              <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
                {error}
              </div>
            )}

            {loadState === 'loading' && (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
                ))}
              </div>
            )}

            {loadState === 'ready' && hauls.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-white/50 leading-relaxed antialiased">
                  No Hauls yet. When a Grocery List is ready, build a Haul to prepare for shopping.
                </p>
                <Link
                  href={APP_ROUTES.foodGroceries}
                  className="mt-4 inline-flex justify-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-white/[0.04] antialiased"
                >
                  Go to Grocery Lists
                </Link>
              </div>
            )}

            {loadState === 'ready' && hauls.length > 0 && (
              <div className="space-y-6">
                {openHauls.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-1">
                      Upcoming &amp; Active
                    </p>
                    <ul className="divide-y divide-white/[0.04]">
                      {openHauls.map((haul) => (
                        <HaulRow key={haul.id} haul={haul} />
                      ))}
                    </ul>
                  </div>
                )}

                {historicalHauls.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased mb-1">
                      Past Hauls
                    </p>
                    <ul className="divide-y divide-white/[0.04]">
                      {historicalHauls.map((haul) => (
                        <HaulRow key={haul.id} haul={haul} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
