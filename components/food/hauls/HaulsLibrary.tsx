'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Search } from 'lucide-react';

import { FoodSectionViewSwitcher } from '@/components/food/FoodSectionViewSwitcher';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll } from '@/components/layout/SignedInPageShell';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GeneratedGroceryList, GroceryHaulCollectionItem } from '@/lib/plans/types';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import { buildEligibleHaulSourceCandidates } from '@/lib/plans/groceryHaul/sourceListSelection';
import { StartHaulDialog } from './StartHaulDialog';
import {
  formatHaulCollectionSpend,
  formatHaulDate,
  haulHrefForStatus,
  haulStatusLabel,
} from './presentation';

type LoadState = 'loading' | 'ready' | 'error';

const FOOD_PAGE_BACKGROUND_CLASS =
  'bg-gradient-to-b from-[#17130f] via-brand-900 to-neutral-700 bg-[length:100%_100vh] bg-no-repeat bg-top bg-neutral-700';

function storeLabel(haul: GroceryHaulCollectionItem): string {
  if (haul.store_names.length > 0) return haul.store_names.join(' + ');
  return 'Store not set';
}

function HaulCollectionTable({ hauls }: { hauls: GroceryHaulCollectionItem[] }) {
  return (
    <section aria-labelledby="recent-hauls-heading">
      <h2 id="recent-hauls-heading" className="sr-only">Recent Hauls</h2>
      <div className="mt-1 hidden h-9 grid-cols-[minmax(0,156fr)_minmax(0,435fr)_minmax(0,210fr)_minmax(6rem,133fr)] items-center px-2 text-[10px] font-semibold text-white lg:grid">
        <span>Date</span>
        <span>Store</span>
        <span>Spend</span>
        <span>Status</span>
      </div>
      <ul className="mt-1 max-lg:divide-y max-lg:divide-white/10 lg:space-y-[5px]">
        {hauls.map((haul) => {
          const spend = formatHaulCollectionSpend(haul);
          return (
            <li key={haul.id}>
              <Link
                href={haulHrefForStatus(haul.id, haul.status)}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 transition-colors hover:bg-white/[0.035] max-lg:px-1 max-lg:py-4 lg:min-h-[25px] lg:grid-cols-[minmax(0,156fr)_minmax(0,435fr)_minmax(0,210fr)_minmax(6rem,133fr)] lg:items-center lg:gap-0 lg:px-2 lg:py-0"
              >
                <div className="min-w-0 break-words">
                  <p className="text-[14px] text-white/50">{formatHaulDate(haul.shopping_date)}</p>
                  <p className="mt-1 text-xs text-white/45 lg:hidden">{storeLabel(haul)}</p>
                </div>
                <p className="hidden truncate text-[14px] text-white/50 lg:block">{storeLabel(haul)}</p>
                <div>
                  <p className="text-[14px] text-white/50">{spend.amount}</p>
                  <p className="mt-1 text-[10px] text-white/35 lg:hidden">{spend.qualifier}</p>
                </div>
                <p className="text-[14px] text-white/50 max-lg:col-span-2">{haulStatusLabel(haul.status)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function HaulsLibrary() {
  const router = useRouter();
  const [hauls, setHauls] = useState<GroceryHaulCollectionItem[]>([]);
  const [lists, setLists] = useState<GeneratedGroceryList[]>([]);
  const [persistentListSummaries, setPersistentListSummaries] = useState<
    Record<string, GroceryListReadinessDecision>
  >({});
  const [defaultListId, setDefaultListId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [startOpen, setStartOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [haulRows, overview] = await Promise.all([
        planService.listGroceryHauls(),
        planService.getGroceryListsOverview(),
      ]);
      setHauls(haulRows);
      setLists([overview.default_list, ...overview.named_lists].filter(
        (list): list is GeneratedGroceryList =>
          Boolean(list && list.status === 'active' && !list.archived_at),
      ));
      setPersistentListSummaries(overview.persistent_list_summaries);
      setDefaultListId(overview.default_list?.id ?? null);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Hauls.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const eligibleStartLists = useMemo(
    () => buildEligibleHaulSourceCandidates(lists, persistentListSummaries),
    [lists, persistentListSummaries],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return hauls;
    return hauls.filter((haul) =>
      [
        haul.title,
        haul.shopping_date,
        formatHaulDate(haul.shopping_date),
        haul.source_list_name,
        ...haul.source_list_names,
        ...haul.store_names,
      ].some((value) => value?.toLocaleLowerCase().includes(needle)),
    );
  }, [hauls, query]);

  return (
    <div className={`flex min-h-screen flex-col text-white ${FOOD_PAGE_BACKGROUND_CLASS}`}>
      <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14 xl:pt-[124px]">
        <div className="mx-auto w-full max-w-[950px]">
          <header className="flex flex-col">
            <div className="h-[34px] shrink-0">
              <FoodSectionViewSwitcher
                currentView="hauls"
                align="left"
                anchorBackgroundClass="bg-[#17130f]"
              />
            </div>
            <h1 className="mt-1 max-w-[900px] text-[32px] font-regular leading-tight text-brand-50 sm:text-[44px] sm:leading-[53px]">
              Start or continue your haul preparation.
            </h1>
          </header>

          <div className="mt-6 grid w-full grid-cols-2 border-b border-white/25 sm:flex sm:items-stretch">
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="h-11 shrink-0 rounded-t-[12px] rounded-b-none border border-b-0 border-white/30 px-4 text-sm font-semibold text-brand-50 hover:bg-white/[0.04] sm:w-[136px]"
            >
              + Create New
            </button>
            <button
              type="button"
              aria-current="page"
              className="h-11 shrink-0 rounded-t-[12px] rounded-b-none bg-brand-50 px-4 text-sm font-semibold text-[#16110d] sm:w-[130px]"
            >
              Recent
            </button>
            <div className="relative col-span-2 flex min-h-11 min-w-0 flex-1 items-center sm:ml-[25px]">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Hauls"
                aria-label="Search Hauls"
                className="h-11 w-full rounded-none border-0 bg-transparent pr-10 pl-0 text-[20px] text-white outline-none placeholder:text-white/35"
              />
              <Search className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <span>{error}</span>
              <button type="button" onClick={() => void load()} className="font-semibold underline">
                Try again
              </button>
            </div>
          )}

          {loadState === 'loading' && (
            <div className="mt-8 space-y-3">
              {[0, 1, 2].map((row) => <div key={row} className="h-6 animate-pulse bg-white/[0.04]" />)}
            </div>
          )}

          {loadState === 'ready' && filtered.length === 0 && (
            <section className="mt-10 border border-white/10 p-7 text-center max-lg:rounded-[24px]">
              <p className="text-lg font-semibold text-brand-50">
                {hauls.length === 0 ? 'Your Hauls will live here.' : 'No Hauls match that search.'}
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/50">
                {hauls.length === 0
                  ? 'Create a Draft from one or more active Lists with source demand.'
                  : 'Try a title, date, source List, or store name.'}
              </p>
              {hauls.length === 0 && eligibleStartLists.length > 0 && (
                <button type="button" onClick={() => setStartOpen(true)} className="mt-5 rounded-full bg-brand-50 px-6 py-3 text-sm font-semibold text-[#16110d]">
                  Create New
                </button>
              )}
              {hauls.length === 0 && eligibleStartLists.length === 0 && (
                <Link href={APP_ROUTES.foodLists} className="mt-5 inline-flex rounded-full border border-white/20 px-6 py-3 text-sm font-semibold">
                  Go to Lists
                </Link>
              )}
            </section>
          )}

          {loadState === 'ready' && filtered.length > 0 && (
            <HaulCollectionTable hauls={filtered} />
          )}
        </div>
      </SignedInPageScroll>
      <JournalFooterNav />
      <StartHaulDialog
        open={startOpen}
        lists={lists}
        persistentListSummaries={persistentListSummaries}
        defaultListId={defaultListId}
        onClose={() => setStartOpen(false)}
        onCreated={(result) => void router.push(APP_ROUTE_BUILDERS.foodHaul(result.haul_id))}
      />
    </div>
  );
}
