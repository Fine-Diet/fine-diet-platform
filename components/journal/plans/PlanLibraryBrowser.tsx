'use client';

import { useMemo, useState, type ReactNode } from 'react';

export type PlanLibrarySort = 'recent' | 'az' | 'za';

export interface PlanLibraryBrowserItem {
  id: string;
  title: string;
  description: string | null;
  metadata?: ReactNode;
  updatedAt: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface PlanLibraryBrowserProps {
  query: string;
  onQueryChange: (value: string) => void;
  items: PlanLibraryBrowserItem[];
  emptyMessage: string;
  searchPlaceholder?: string;
  busy?: boolean;
}

const SORT_OPTIONS: Array<{ value: PlanLibrarySort; label: string }> = [
  { value: 'recent', label: 'Recent' },
  { value: 'az', label: 'A–Z' },
  { value: 'za', label: 'Z–A' },
];

function compareTitles(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function sortPlanLibraryItems(
  items: PlanLibraryBrowserItem[],
  sort: PlanLibrarySort,
): PlanLibraryBrowserItem[] {
  const next = [...items];
  if (sort === 'recent') {
    next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return next;
  }
  if (sort === 'az') {
    next.sort((a, b) => compareTitles(a.title, b.title));
    return next;
  }
  next.sort((a, b) => compareTitles(b.title, a.title));
  return next;
}

export function filterPlanLibraryItems(
  items: PlanLibraryBrowserItem[],
  query: string,
): PlanLibraryBrowserItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    const haystack = `${item.title} ${item.description ?? ''}`.toLowerCase();
    return haystack.includes(needle);
  });
}

export function PlanLibraryBrowser({
  query,
  onQueryChange,
  items,
  emptyMessage,
  searchPlaceholder = 'Search',
  busy = false,
}: PlanLibraryBrowserProps) {
  const [sort, setSort] = useState<PlanLibrarySort>('recent');

  const visibleItems = useMemo(
    () => sortPlanLibraryItems(filterPlanLibraryItems(items, query), sort),
    [items, query, sort],
  );

  return (
    <div className={busy ? 'opacity-60' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <label className="inline-flex items-center gap-1.5 text-xs text-white/55">
          <span className="sr-only">Sort library</span>
          <select
            aria-label="Sort library"
            value={sort}
            onChange={(event) => setSort(event.target.value as PlanLibrarySort)}
            className="appearance-none border-0 bg-transparent py-1 pr-5 text-sm text-white/80 outline-none focus:text-white"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#16110d] text-white">
                {option.label}
              </option>
            ))}
          </select>
          <span aria-hidden className="-ml-4 pointer-events-none text-[10px] text-white/45">▾</span>
        </label>

        <div className="relative w-full min-w-0 sm:w-[220px]">
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 pr-9 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/25"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40"
          >
            ⌕
          </span>
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <ul className="mt-5 grid grid-cols-1 gap-x-10 gap-y-5 border-b border-white/10 pb-8 sm:grid-cols-2">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                onClick={item.onSelect}
                className="group w-full rounded-md px-1 py-1 text-left transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-white/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="block text-[15px] font-medium leading-snug text-white group-hover:text-white">
                  {item.title}
                </span>
                {item.description ? (
                  <span className="mt-1 block text-[11px] leading-5 text-white/45">
                    {item.description}
                  </span>
                ) : null}
                {item.metadata ? (
                  <span className="mt-1 block text-[11px] leading-5 text-white/30">
                    {item.metadata}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-12 text-center text-sm text-white/45">{emptyMessage}</p>
      )}
    </div>
  );
}
