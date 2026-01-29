'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
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

/** Format 24h time string (HH:MM) to 12h display (e.g. "8:00 am") */
function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Adjust hour by delta, wrapping 0-23 */
function adjustHour(time24: string, delta: number): string {
  const [h, m] = time24.split(':').map(Number);
  let newHour = (h + delta) % 24;
  if (newHour < 0) newHour += 24;
  return `${newHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
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
  const [savedMealsDropdownOpen, setSavedMealsDropdownOpen] = useState(false);
  const savedMealsDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedTime, setSelectedTime] = useState(timeParam);

  useEffect(() => {
    if (!savedMealsDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (savedMealsDropdownRef.current && !savedMealsDropdownRef.current.contains(e.target as Node)) {
        setSavedMealsDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [savedMealsDropdownOpen]);

  const date = parseDateParam(dateParam);
  const dateKey = toDateKey(date);

  // Mock saved meals for demo
  const savedMeals = [
    { id: '1', name: 'Smoothie', nutritionDensity: 85 },
    { id: '2', name: 'Standard Breakfast', nutritionDensity: 72 },
    { id: '3', name: 'Lunch Bowl', nutritionDensity: 78 },
  ];

  const refreshEntries = () => {
    setEntries(journalService.listEntriesByDayAndBlock(date, block));
  };

  useEffect(() => {
    refreshEntries();
  }, [dateKey, block]);

  const handleDeleteEntry = (entryId: string) => {
    journalService.deleteEntry(entryId);
    refreshEntries();
  };

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
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-brand-900/98 backdrop-blur">
        <h1 className="text-lg font-semibold text-brand-50">Log Entry</h1>
        <div className="flex items-center gap-3">
          {savedFeedback && (
            <span className="font-semibold text-sm text-brand-200">Saved</span>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Entry type tabs */}
        <div className="px-6 pt-1">
          <div className="flex items-center gap-0 p-0 rounded-full border-[1.5px] border-brand-200/50">
            <button
              type="button"
              onClick={() => setEntryTab('food')}
              className={`flex-1 py-1 px-6 rounded-full text-2xl font-semibold transition-colors border-[1.5px] border-brand-50 ${
                entryTab === 'food'
                  ? ' text-brand-50'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Food / Drinks
            </button>
            <button
              type="button"
              onClick={() => setEntryTab('water')}
              className={`flex-1 px-1 rounded-full text-2xl font-semibold text-brand-200/50 transition-colors ${
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
              className={`px-1 rounded-full text-2xl font-semibold text-brand-200/50 truncate`}
              disabled
            >
              Suppl...
            </button>
            <span className="text-brand-200/50 pr-2 font-normal leading-none inline-flex items-center" style={{ fontSize: '38px' }}>›</span>
          </div>
        </div>

        {/* Time picker — clock icon, clickable time (opens native picker), up/down stepper */}
        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-1">
            {/* Clock icon */}
            <svg className="w-8 h-8 text-white/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {/* Time display — clicking opens native time picker popup */}
            <div className="relative">
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                aria-label="Select time"
              />
              <span className="text-brand-50 font-semibold text-xl pointer-events-none">
                {formatTime12h(selectedTime)}
              </span>
            </div>
            {/* Up/down stepper arrows (stacked) for quick hour adjustment */}
            <div className="flex flex-col -space-y-0.5">
              <button
                type="button"
                onClick={() => setSelectedTime(adjustHour(selectedTime, 1))}
                className="px-0.5 py-0 text-white/60 hover:text-white transition-colors leading-none"
                aria-label="Increase hour"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTime(adjustHour(selectedTime, -1))}
                className="px-0.5 py-0 text-white/60 hover:text-white transition-colors leading-none"
                aria-label="Decrease hour"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className="px-6 pt-1">
          <div className="relative">
            <input
              type="search"
              placeholder="Search & Add Food, Meals or Beverages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full bg-brand-300 px-6 py-3.5 pr-12 text-brand-50 placeholder-brand-50/75 text-base focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <button
              type="button"
              onClick={handleQuickAdd}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-brand-50 hover:text-white transition-colors"
              aria-label="Scan barcode"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Logged section — items in a container, separated */}
        <section className="px-6 pt-6">
          <h2 className="text-brand-50 text-xl font-semibold mb-3">Logged</h2>
          {entries.length === 0 ? (
            <p className="text-white/40 text-sm py-4">No items logged yet. Search or scan to add.</p>
          ) : (
            <div className="rounded-xl border border-white/10">
              {entries.map((entry, index) => (
                <div key={entry.id}>
                  {index > 0 && <div className="border-t border-white/10" />}
                  <LoggedItemCard
                    id={entry.id}
                    name={entry.payload.name ?? 'Untitled'}
                    serving={`${entry.payload.quantity ?? 1} ${entry.payload.unit ?? 'Serving'}`}
                    editHref={`/journal/entry/${entry.id}?redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
                    onDelete={handleDeleteEntry}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Bottom tabs: Saved Meals (with dropdown) / Favorites / History */}
        <section className="px-4 pt-6">
          <div className="flex items-center gap-4 border-b border-white/10 pb-2">
            <div className="relative inline-flex items-center" ref={savedMealsDropdownRef}>
              <button
                type="button"
                onClick={() => setBottomTab('saved')}
                className={`inline-flex items-center gap-1 text-sm font-medium pb-2 border-b-2 transition-colors shrink-0 ${
                  bottomTab === 'saved'
                    ? 'text-white border-white'
                    : 'text-white/50 border-transparent hover:text-white/70'
                }`}
              >
                Saved Meals
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSavedMealsDropdownOpen((o) => !o); }}
                className="inline-flex items-center justify-center p-1 shrink-0 text-white/50 hover:text-white transition-colors pb-2 border-b-2 border-transparent"
                aria-label="Saved meals options"
                aria-expanded={savedMealsDropdownOpen}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {savedMealsDropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-lg bg-brand-800 border border-white/20 shadow-lg py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/journal/meals/create?block=${block}&date=${dateKey}&redirect=${encodeURIComponent(router.asPath || redirectTarget)}`}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 transition-colors"
                    onClick={() => setSavedMealsDropdownOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Create meal
                  </Link>
                  <Link
                    href={`/journal/meals?redirect=${encodeURIComponent(router.asPath || redirectTarget)}`}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 transition-colors"
                    onClick={() => setSavedMealsDropdownOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit meals
                  </Link>
                </div>
              )}
            </div>
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
