'use client';

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import {
  journalService,
  toDateKey,
  type TimeBlock,
  type JournalEntry,
  TIME_BLOCK_DEFAULTS,
} from '@/lib/journal';

const BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

function parseDateParam(value: string | string[] | null | undefined): Date {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return new Date();
  const d = new Date(v + 'T12:00:00');
  return isNaN(d.getTime()) ? new Date() : d;
}

export default function JournalLogPage() {
  const router = useRouter();
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const type = q.type ?? 'intake';
  const block = (q.block ?? 'morning') as TimeBlock;
  const timeParam = q.time ?? TIME_BLOCK_DEFAULTS[block];
  const dateParam = q.date;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal');

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [mealCreatedBanner, setMealCreatedBanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const date = parseDateParam(dateParam);
  const dateKey = toDateKey(date);

  useEffect(() => {
    if (q.meal_created === '1') {
      setMealCreatedBanner(true);
      const t = setTimeout(() => setMealCreatedBanner(false), 4000);
      const { meal_created: _, ...rest } = q;
      router.replace({ pathname: '/journal/log', query: rest }, undefined, { shallow: true });
      return () => clearTimeout(t);
    }
  }, [q.meal_created]);

  useEffect(() => {
    const list = journalService.listEntriesByDayAndBlock(date, block);
    setEntries(list);
  }, [dateKey, block]);

  const handleQuickAdd = () => {
    const name = 'Demo item';
    journalService.createEntry({
      type: 'intake',
      date,
      time: timeParam,
      block,
      payload: { name, quantity: 1, unit: 'serving' },
    });
    setEntries(journalService.listEntriesByDayAndBlock(date, block));
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleScan = () => {
    // Placeholder: noop or open stub modal
  };

  return (
    <div className="min-h-screen bg-brand-900 text-white max-w-[1200px] mx-auto relative flex flex-col">
      {/* Modal-style header: back + title */}
      <header className="sticky top-0 z-20 flex items-center gap-4 px-4 py-4 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <Link
          href={redirectTarget}
          className="p-2 -ml-2 text-white/80 hover:text-white transition-colors"
          aria-label="Back"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-medium text-white">
          Log — {BLOCK_LABELS[block]}
        </h1>
      </header>

      <main className="flex-1 px-4 py-6">
        {mealCreatedBanner && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-dark_accent-500/20 text-dark_accent-200 text-sm">
            Meal saved.
          </div>
        )}
        {/* Segmented control: Food/Drinks | Water (disabled) */}
        <div className="flex rounded-lg bg-white/10 p-1 mb-4">
          <button
            type="button"
            className="flex-1 py-2 rounded-md text-sm font-medium text-white bg-white/20"
          >
            Food / Drinks
          </button>
          <button
            type="button"
            disabled
            className="flex-1 py-2 rounded-md text-sm font-medium text-white/50 cursor-not-allowed"
          >
            Water
          </button>
        </div>

        {/* Search + Scan */}
        <div className="flex items-center gap-2 mb-4">
          <input
            type="search"
            placeholder="Search foods..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <button
            type="button"
            onClick={handleScan}
            className="p-2.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Scan"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </button>
        </div>

        {/* Quick add demo item */}
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleQuickAdd}
            className="px-4 py-2 rounded-lg bg-white/15 border border-white/20 text-white text-sm font-medium hover:bg-white/25 transition-colors"
          >
            Quick add demo item
          </button>
          {savedFeedback && (
            <span className="text-sm text-dark_accent-300">Saved</span>
          )}
        </div>

        {/* Logged section */}
        <section>
          <h2 className="text-white/80 text-sm font-medium mb-2">Logged</h2>
          {entries.length === 0 ? (
            <p className="text-white/50 text-sm">No items yet. Add something above.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/journal/entry/${entry.id}?redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-white">
                      {entry.payload.name ?? 'Untitled'}
                      {entry.payload.quantity != null && (
                        <span className="text-white/70 text-sm ml-1">
                          {entry.payload.quantity} {entry.payload.unit ?? ''}
                        </span>
                      )}
                    </span>
                    <span className="text-white/60" aria-hidden>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Create meal from logged — CTA for Phase 1D */}
        {entries.length > 0 && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <Link
              href={`/journal/meals/create?block=${block}&date=${dateKey}&redirect=${encodeURIComponent(redirectTarget)}`}
              className="inline-flex items-center gap-2 text-dark_accent-300 hover:text-dark_accent-100 text-sm font-medium"
            >
              Create meal from logged
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
