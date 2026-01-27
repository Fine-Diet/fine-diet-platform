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
import { LoggedItemCard } from '@/components/journal/LoggedItemCard';
import { SavedMealCard } from '@/components/journal/SavedMealCard';

type EntryTab = 'food' | 'water' | 'supplements';
type BottomTab = 'saved' | 'favorites' | 'history';

function parseDateParam(value: string | string[] | null | undefined): Date {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return new Date();
  const d = new Date(v + 'T12:00:00');
  return isNaN(d.getTime()) ? new Date() : d;
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

export default function JournalLogPage() {
  const router = useRouter();
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const block = (q.block ?? 'morning') as TimeBlock;
  const timeParam = q.time ?? TIME_BLOCK_DEFAULTS[block];
  const dateParam = q.date;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal');

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [entryTab, setEntryTab] = useState<EntryTab>('food');
  const [bottomTab, setBottomTab] = useState<BottomTab>('saved');
  const [selectedTime, setSelectedTime] = useState(timeParam);

  const date = parseDateParam(dateParam);
  const dateKey = toDateKey(date);

  // Mock saved meals for demo
  const savedMeals = [
    { id: '1', name: 'Smoothie', nutritionDensity: 85 },
    { id: '2', name: 'Standard Breakfast', nutritionDensity: 72 },
    { id: '3', name: 'Lunch Bowl', nutritionDensity: 78 },
  ];

  useEffect(() => {
    const list = journalService.listEntriesByDayAndBlock(date, block);
    setEntries(list);
  }, [dateKey, block]);

  const handleQuickAdd = () => {
    const name = 'Demo item';
    journalService.createEntry({
      type: 'intake',
      date,
      time: selectedTime,
      block,
      payload: { name, quantity: 1, unit: 'serving' },
    });
    setEntries(journalService.listEntriesByDayAndBlock(date, block));
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleClose = () => {
    router.push(redirectTarget);
  };

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {/* Modal header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-4 border-b border-white/10 bg-brand-900/98 backdrop-blur">
        <h1 className="text-lg font-medium text-white">Log Entry</h1>
        <div className="flex items-center gap-3">
          {savedFeedback && (
            <span className="text-sm text-white/60">Saved</span>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Entry type tabs */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-1 p-1 rounded-full bg-white/10">
            <button
              type="button"
              onClick={() => setEntryTab('food')}
              className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-colors ${
                entryTab === 'food'
                  ? 'bg-white/20 text-white'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Food / Drinks
            </button>
            <button
              type="button"
              onClick={() => setEntryTab('water')}
              className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-colors ${
                entryTab === 'water'
                  ? 'bg-white/20 text-white'
                  : 'text-white/50'
              }`}
              disabled
            >
              Water
            </button>
            <button
              type="button"
              onClick={() => setEntryTab('supplements')}
              className={`py-2.5 px-3 rounded-full text-sm font-medium text-white/50 truncate`}
              disabled
            >
              Supplemen...
            </button>
            <span className="text-white/40 pr-2">›</span>
          </div>
        </div>

        {/* Time picker */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 text-white/80">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none"
            />
            <span className="text-white/60 text-sm">
              {formatTime12h(selectedTime)}
            </span>
          </div>
        </div>

        {/* Search input */}
        <div className="px-4 pt-4">
          <div className="relative">
            <input
              type="search"
              placeholder="Search & Add Food, Meals or Beverages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3.5 pr-12 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <button
              type="button"
              onClick={handleQuickAdd}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/60 hover:text-white transition-colors"
              aria-label="Scan barcode"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Logged section */}
        <section className="px-4 pt-6">
          <h2 className="text-white/80 text-sm font-medium mb-3">Logged</h2>
          {entries.length === 0 ? (
            <p className="text-white/40 text-sm py-4">No items logged yet. Search or scan to add.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <LoggedItemCard
                  key={entry.id}
                  id={entry.id}
                  name={entry.payload.name ?? 'Untitled'}
                  serving={`${entry.payload.quantity ?? 1} ${entry.payload.unit ?? 'Serving'}`}
                  editHref={`/journal/entry/${entry.id}?redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
                />
              ))}
            </div>
          )}
        </section>

        {/* Bottom tabs: Saved Meals / Favorites / History */}
        <section className="px-4 pt-6">
          <div className="flex items-center gap-4 border-b border-white/10 pb-2">
            <button
              type="button"
              onClick={() => setBottomTab('saved')}
              className={`flex items-center gap-1 text-sm font-medium pb-2 border-b-2 transition-colors ${
                bottomTab === 'saved'
                  ? 'text-white border-white'
                  : 'text-white/50 border-transparent hover:text-white/70'
              }`}
            >
              Saved Meals
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setBottomTab('favorites')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                bottomTab === 'favorites'
                  ? 'text-white border-white'
                  : 'text-white/50 border-transparent hover:text-white/70'
              }`}
            >
              Favorites
            </button>
            <button
              type="button"
              onClick={() => setBottomTab('history')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                bottomTab === 'history'
                  ? 'text-white border-white'
                  : 'text-white/50 border-transparent hover:text-white/70'
              }`}
            >
              History
            </button>
          </div>

          {/* Horizontal scroll cards */}
          <div className="flex gap-3 overflow-x-auto py-4 -mx-4 px-4 scrollbar-hide">
            {bottomTab === 'saved' && savedMeals.map((meal) => (
              <SavedMealCard
                key={meal.id}
                id={meal.id}
                name={meal.name}
                nutritionDensity={meal.nutritionDensity}
              />
            ))}
            {bottomTab === 'favorites' && (
              <p className="text-white/40 text-sm py-4">No favorites yet.</p>
            )}
            {bottomTab === 'history' && (
              <p className="text-white/40 text-sm py-4">No history yet.</p>
            )}
          </div>
        </section>

        {/* Create meal from logged */}
        {entries.length > 0 && (
          <div className="px-4 pb-8">
            <Link
              href={`/journal/meals/create?block=${block}&date=${dateKey}&redirect=${encodeURIComponent(redirectTarget)}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border border-white/20 text-white/70 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create meal from logged
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
