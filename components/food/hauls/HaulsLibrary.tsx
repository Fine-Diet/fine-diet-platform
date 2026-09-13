'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Search } from 'lucide-react';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll } from '@/components/layout/SignedInPageShell';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GeneratedGroceryList, GroceryHaulCollectionItem } from '@/lib/plans/types';
import { StartHaulDialog } from './StartHaulDialog';
import {
  formatHaulCurrency,
  formatHaulDate,
  haulHrefForStatus,
  haulStatusLabel,
} from './presentation';

type LoadState = 'loading' | 'ready' | 'error';

function displayTitle(haul: GroceryHaulCollectionItem): string {
  return haul.title?.trim() || `Haul · ${formatHaulDate(haul.shopping_date)}`;
}

function HaulTable({
  label,
  hauls,
}: {
  label: string;
  hauls: GroceryHaulCollectionItem[];
}) {
  if (hauls.length === 0) return null;
  return (
    <section className="mt-9" aria-labelledby={`${label.replace(/\s/g, '-')}-heading`}>
      <div className="flex items-center justify-between border-b border-white/20 pb-3">
        <h2 id={`${label.replace(/\s/g, '-')}-heading`} className="text-sm font-semibold text-brand-50">
          {label}
        </h2>
        <span className="text-xs text-white/35">
          {hauls.length} {hauls.length === 1 ? 'Haul' : 'Hauls'}
        </span>
      </div>
      <div className="hidden grid-cols-[1.25fr_1.7fr_0.8fr_0.7fr] gap-5 border-b border-white/10 px-2 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 sm:grid">
        <span>Date</span><span>Sources / stores</span><span>Estimate</span><span>Status</span>
      </div>
      <ul className="divide-y divide-white/10">
        {hauls.map((haul) => {
          const sources = haul.source_list_names.length > 0
            ? haul.source_list_names.join(' + ')
            : haul.source_list_name || 'Source List';
          const stores = haul.store_names.length > 0 ? haul.store_names.join(' + ') : 'Store not set';
          return (
            <li key={haul.id}>
              <Link
                href={haulHrefForStatus(haul.id, haul.status)}
                className="grid gap-3 px-2 py-5 transition-colors hover:bg-white/[0.035] sm:grid-cols-[1.25fr_1.7fr_0.8fr_0.7fr] sm:items-center sm:gap-5"
              >
                <div>
                  <p className="text-sm font-semibold text-brand-50">{displayTitle(haul)}</p>
                  <p className="mt-1 text-xs text-white/45">{formatHaulDate(haul.shopping_date)}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-white/70">{sources}</p>
                  <p className="mt-1 truncate text-xs text-white/40">{stores}</p>
                </div>
                <div>
                  <p className="text-sm text-white/75">
                    {formatHaulCurrency(haul.estimated_total, haul.currency)}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    {haul.execution_item_count} live · {haul.unpriced_item_count} unpriced
                  </p>
                </div>
                <span className="w-fit rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                  {haulStatusLabel(haul.status)}
                </span>
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
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Hauls.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return hauls;
    return hauls.filter((haul) =>
      [
        haul.title,
        haul.shopping_date,
        formatHaulDate(haul.shopping_date),
        ...haul.source_list_names,
        ...haul.store_names,
      ].some((value) => value?.toLocaleLowerCase().includes(needle)),
    );
  }, [hauls, query]);

  const drafts = filtered.filter((haul) => haul.status === 'planned');
  const inProgress = filtered.filter((haul) => haul.status === 'active');
  const history = filtered.filter((haul) => haul.status === 'closed' || haul.status === 'cancelled');

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14">
        <div className="mx-auto w-full max-w-[1000px]">
          <header>
            <p className="text-lg font-semibold text-white">Hauls</p>
            <h1 className="mt-1 max-w-3xl text-4xl font-light tracking-tight text-brand-50 sm:text-5xl">
              Start or continue your haul preparation.
            </h1>
          </header>

          <div className="mt-8 flex flex-col gap-3 border-b border-white/25 pb-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="min-h-11 rounded-t-xl border border-white/30 px-5 text-sm font-semibold text-brand-50 hover:bg-white/[0.04]"
            >
              + Create New
            </button>
            <div className="relative min-w-0 flex-1 sm:ml-auto sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Hauls"
                aria-label="Search Hauls"
                className="min-h-11 w-full rounded-xl border border-white/15 bg-transparent pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/45"
              />
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
              {[0, 1, 2].map((row) => <div key={row} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          )}

          {loadState === 'ready' && filtered.length === 0 && (
            <section className="mt-10 rounded-[24px] border border-white/10 p-7 text-center">
              <p className="text-lg font-semibold text-brand-50">
                {hauls.length === 0 ? 'Your Hauls will live here.' : 'No Hauls match that search.'}
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/50">
                {hauls.length === 0
                  ? 'Create a Draft from one or more active Lists with source demand.'
                  : 'Try a title, date, source List, or store name.'}
              </p>
              {hauls.length === 0 && lists.length > 0 && (
                <button type="button" onClick={() => setStartOpen(true)} className="mt-5 rounded-full bg-brand-50 px-6 py-3 text-sm font-semibold text-[#16110d]">
                  Create New
                </button>
              )}
              {hauls.length === 0 && lists.length === 0 && (
                <Link href={APP_ROUTES.foodLists} className="mt-5 inline-flex rounded-full border border-white/20 px-6 py-3 text-sm font-semibold">
                  Go to Lists
                </Link>
              )}
            </section>
          )}

          {loadState === 'ready' && filtered.length > 0 && (
            <>
              <HaulTable label="Draft preparation" hauls={drafts} />
              <HaulTable label="Shopping in progress" hauls={inProgress} />
              <HaulTable label="History" hauls={history} />
            </>
          )}
        </div>
      </SignedInPageScroll>
      <JournalFooterNav />
      <StartHaulDialog
        open={startOpen}
        lists={lists}
        onClose={() => setStartOpen(false)}
        onCreated={(result) => void router.push(APP_ROUTE_BUILDERS.foodHaul(result.haul_id))}
      />
    </div>
  );
}
