'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import type {
  ProgramsHomeCatalogueItem,
  ProgramsHomeCategoryViewModel,
} from '@/lib/programs/home/types';
import { cn } from '@/lib/utils';

function SearchIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z"
      />
    </svg>
  );
}

export function ProgramsByCategoryModule({
  category,
  onSelectCategory,
  onSearchChange,
  onOpenItem,
}: {
  category: ProgramsHomeCategoryViewModel;
  onSelectCategory: (key: string) => void;
  onSearchChange: (query: string) => void;
  onOpenItem: (item: ProgramsHomeCatalogueItem) => void;
}) {
  const [draft, setDraft] = useState(category.searchQuery);

  useEffect(() => {
    setDraft(category.searchQuery);
  }, [category.searchQuery]);

  return (
    <section
      aria-labelledby="programs-by-category-heading"
      className="mt-12 md:mt-16"
    >
      <h2 id="programs-by-category-heading" className="sr-only">
        Programs by Category
      </h2>

      <div className="flex flex-col gap-4 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {category.categories.map((tab) => {
            const selected = tab.key === category.selectedCategoryKey;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectCategory(tab.key)}
                className={cn(
                  'relative shrink-0 px-3 py-2 text-sm font-semibold transition',
                  selected ? 'text-white' : 'text-white/45 hover:text-white/75',
                )}
                aria-current={selected ? 'page' : undefined}
              >
                {tab.label}
                {selected ? (
                  <span className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-white" />
                ) : null}
              </button>
            );
          })}
          <span
            className="mx-2 hidden h-5 w-px shrink-0 bg-white/20 sm:block"
            aria-hidden
          />
        </div>

        <label className="relative block w-full md:max-w-[220px]">
          <span className="sr-only">Search programs</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            type="search"
            value={draft}
            placeholder="Search"
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              onSearchChange(next);
            }}
            className="h-10 w-full rounded-full border border-white/15 bg-white/[0.06] pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-white/35 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-6">
        {category.listStatus === 'coming_soon' ? (
          <EmptyState
            title={`${
              category.categories.find(
                (c) => c.key === category.selectedCategoryKey,
              )?.label ?? 'This category'
            } is coming soon`}
            body="Programs in this category will appear here when they are ready. Nutrition seeds remain available for review."
          />
        ) : null}

        {category.listStatus === 'empty_category' ? (
          <EmptyState
            title="No programs in this category yet"
            body="Catalogue items will attach when signed-in program series storage is restored."
          />
        ) : null}

        {category.listStatus === 'no_results' ? (
          <EmptyState
            title="No matching programs"
            body={`Nothing matched “${category.searchQuery}”. Clear search to restore the selected category.`}
          />
        ) : null}

        {category.listStatus === 'idle' || category.listStatus === 'results' ? (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-8 md:gap-y-6">
            {category.visibleItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#1c1712]">
                  <Image
                    src={item.imageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {item.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/55">
                    {item.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-white/35 px-3 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-white/55">{body}</p>
    </div>
  );
}
