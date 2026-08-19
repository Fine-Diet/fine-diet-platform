'use client';

/**
 * Food → Haul detail — Packet 11B canonical dated shopping-execution surface.
 *
 * Reads grocery_hauls + grocery_haul_items snapshots only. Does not mutate
 * Grocery List, Pantry, pricing, retailer assignment, carts, or receipts.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GroceryHaul, GroceryHaulItem } from '@/lib/plans/types';
import {
  formatGroceryHaulSnapshotAmount,
  formatGroceryHaulSnapshotProvenance,
  formatGroceryHaulUserFacingStatusLabel,
  formatGroceryHaulDisplayName,
} from '@/lib/plans/groceryHaul/copy';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { emitGroceryHaulEvent } from '@/lib/plans/groceryHaul/emitEvent';
import {
  GROCERY_HAUL_CREATE_POLICY_ID,
  GROCERY_HAUL_CREATE_POLICY_VERSION,
} from '@/lib/plans/groceryHaul/events';

export default function GroceryHaulDetailPage() {
  const router = useRouter();
  const haulId = typeof router.query.haulId === 'string' ? router.query.haulId : null;
  const [haul, setHaul] = useState<GroceryHaul | null>(null);
  const [items, setItems] = useState<GroceryHaulItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!haulId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await planService.getGroceryHaul(haulId);
      setHaul(result.haul);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load haul.');
    } finally {
      setLoading(false);
    }
  }, [haulId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !haul) return;
    emitGroceryHaulEvent({
      event: 'grocery_haul_viewed',
      policyId: GROCERY_HAUL_CREATE_POLICY_ID,
      policyVersion: GROCERY_HAUL_CREATE_POLICY_VERSION,
      path: 'primary',
      reasonCodes: [],
      listId: haul.source_grocery_list_id,
      haulId: haul.id,
      shoppingDate: haul.shopping_date,
      readinessState: 'unknown',
      pendingCount: items.length,
      outcome: 'none',
      blockReason: null,
    });
    // Intentional: fire once per loaded haul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haul?.id, loading]);

  if (!haulId) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/50 antialiased">No haul ID.</p>
        </div>
        <JournalFooterNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-white/40 antialiased">
              <Link
                href="/app/food/hauls"
                className="hover:text-white/70 transition-colors"
              >
                ← Hauls
              </Link>
              {haul && (
                <>
                  <span>/</span>
                  <Link
                    href={APP_ROUTE_BUILDERS.foodGroceryList(haul.source_grocery_list_id)}
                    className="hover:text-white/70 transition-colors"
                  >
                    Grocery List
                  </Link>
                </>
              )}
            </div>
            <h1 className="mt-1 text-xl font-semibold text-white antialiased">Haul</h1>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-4 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-4 w-48 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-400/20 px-3 py-3">
              <p className="text-sm text-amber-100 antialiased">{error}</p>
            </div>
          ) : haul ? (
            <>
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-4 space-y-1.5">
                {/* Occasion identity — derived display name */}
                <p className="text-base font-semibold text-brand-50 antialiased">
                  {formatGroceryHaulDisplayName(haul.shopping_date, todayLocalDateKey())}
                </p>
                {/* Execution status */}
                <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased">
                  {formatGroceryHaulUserFacingStatusLabel(haul.status)}
                </p>
                {/* Shopping date */}
                <p className="text-sm text-white/60 antialiased">Shopping date: {haul.shopping_date}</p>
                {/* Source List */}
                <Link
                  href={APP_ROUTE_BUILDERS.foodGroceryList(haul.source_grocery_list_id)}
                  className="inline-block text-[12px] text-denim-300 hover:text-denim-200 antialiased"
                >
                  Open source Grocery List
                </Link>
              </div>

              <div className="rounded-2xl bg-white/[0.04] overflow-hidden divide-y divide-white/[0.04]">
                {items.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-white/60 antialiased">
                    No items were captured in this Haul snapshot.
                  </p>
                ) : (
                  items.map((item) => {
                    const provenance = formatGroceryHaulSnapshotProvenance(item.source_type_snapshot);
                    return (
                      <div key={item.id} className="px-3 py-3">
                        <p className="text-sm text-white antialiased">{item.name_snapshot}</p>
                        <p className="mt-0.5 text-[12px] text-white/50 antialiased">
                          {formatGroceryHaulSnapshotAmount(item)}
                          {provenance ? ` · ${provenance}` : ''}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <JournalFooterNav />
    </div>
  );
}
