'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import {
  journalService,
  toDateKey,
  deriveBlock,
  setTimeOnDate,
  parseLocalDate,
  type TimeBlock,
  type JournalEntry,
  type MealTemplate,
  TIME_BLOCK_DEFAULTS,
} from '@/lib/journal';
import { LoggedItemCard } from '@/components/journal/LoggedItemCard';
import { SavedMealCard } from '@/components/journal/SavedMealCard';

type EntryTab = 'food' | 'water' | 'supplements' | 'mood' | 'bowel' | 'cycle' | 'movement';
type BottomTab = 'saved' | 'favorites' | 'history';

// All entry type tabs in default order
const ALL_ENTRY_TABS: { id: EntryTab; label: string; disabled: boolean }[] = [
  { id: 'food', label: 'Food / Drinks', disabled: false },
  { id: 'water', label: 'Water', disabled: true },
  { id: 'supplements', label: 'Supplements', disabled: true },
  { id: 'mood', label: 'Mood', disabled: true },
  { id: 'bowel', label: 'Bowel', disabled: true },
  { id: 'cycle', label: 'Cycle', disabled: true },
  { id: 'movement', label: 'Movement', disabled: true },
];

function parseDateParam(value: string | string[] | null | undefined): Date {
  const v = Array.isArray(value) ? value[0] : value;
  return parseLocalDate(v);
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
  const savedMealsScrollRef = useRef<HTMLDivElement>(null);
  const [savedMealsCanScrollLeft, setSavedMealsCanScrollLeft] = useState(false);
  const [savedMealsCanScrollRight, setSavedMealsCanScrollRight] = useState(false);
  const [selectedTime, setSelectedTime] = useState(timeParam);
  const [savedMeals, setSavedMeals] = useState<MealTemplate[]>([]);

  function updateSavedMealsScrollState() {
    const el = savedMealsScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setSavedMealsCanScrollLeft(scrollLeft > 2);
    setSavedMealsCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
  }

  // Looping tab carousel: selected tab pinned left, others rotate
  const unselectedTabs = ALL_ENTRY_TABS.filter(t => t.id !== entryTab);
  const [tabRotation, setTabRotation] = useState(0);

  // Get rotated order of unselected tabs
  const rotatedTabs = [
    ...unselectedTabs.slice(tabRotation % unselectedTabs.length),
    ...unselectedTabs.slice(0, tabRotation % unselectedTabs.length),
  ];

  // Rotate tabs when chevron is clicked
  const handleChevronClick = () => {
    setTabRotation((prev) => prev + 1);
  };

  // Get the selected tab info
  const selectedTabInfo = ALL_ENTRY_TABS.find(t => t.id === entryTab)!;

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

  const refreshEntries = async () => {
    const list = await journalService.listEntriesByDay(date);
    // Filter by local date first (server returns wide window), then by block
    const filtered = list.filter((e) => {
      const entryDateKey = toDateKey(e.timestamp);
      return entryDateKey === dateKey && deriveBlock(e.timestamp) === block;
    });
    setEntries(filtered);
  };

  useEffect(() => {
    refreshEntries();
  }, [dateKey, block]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch saved meal templates from API (and refetch when returning from create with meal_created=1)
  const refreshSavedMeals = async () => {
    const list = await journalService.listMealTemplates();
    setSavedMeals(list);
  };
  useEffect(() => {
    refreshSavedMeals();
  }, []);
  useEffect(() => {
    if (q.meal_created === '1') refreshSavedMeals();
  }, [q.meal_created]);

  // Saved meals scroll: update chevron visibility on scroll, resize, and when tab/content changes
  useEffect(() => {
    updateSavedMealsScrollState();
    const el = savedMealsScrollRef.current;
    if (!el) return;
    const onScrollOrResize = () => updateSavedMealsScrollState();
    el.addEventListener('scroll', onScrollOrResize);
    const ro = new ResizeObserver(onScrollOrResize);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScrollOrResize);
      ro.disconnect();
    };
  }, [bottomTab, savedMeals?.length ?? 0]);

  const handleDeleteEntry = async (entryId: string) => {
    await journalService.deleteEntry(entryId);
    refreshEntries();
  };

  const handleQuickAdd = async () => {
    const occurredAt = setTimeOnDate(new Date(date.getTime()), selectedTime);
    await journalService.createEntry({
      type: 'intake',
      date,
      time: selectedTime,
      block,
      occurredAt,
      payload: { name: 'Demo Item', quantity: 1, unit: 'serving' },
    });
    await refreshEntries();
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
        <div className="max-w-[650px] mx-auto">
        {/* Entry type tabs — looping carousel with selected tab pinned left */}
        <div className="px-6 pt-1">
          <div className="relative rounded-full border-[1.5px] border-brand-200/50 overflow-hidden">
            {/* Tab container — scrollable + chevron rotation */}
            <div className="flex items-center pr-8 overflow-x-auto scrollbar-hide">
              {/* Selected tab — always first/pinned */}
              <button
                type="button"
                className="shrink-0 whitespace-nowrap py-1.5 px-4 rounded-full text-2xl font-semibold border-[1.5px] border-brand-50 text-brand-50"
              >
                {selectedTabInfo.label}
              </button>

              {/* Unselected tabs — rotated order */}
              {rotatedTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => !tab.disabled && setEntryTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap py-1.5 px-4 rounded-full text-2xl font-semibold transition-colors ${
                    tab.disabled
                      ? 'text-brand-200/50'
                      : 'text-white/60 hover:text-white cursor-pointer'
                  }`}
                  disabled={tab.disabled}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chevron button — rotates tabs when clicked */}
            <button
              type="button"
              onClick={handleChevronClick}
              className="absolute right-0 top-0 bottom-0 flex items-center pl-6 pr-0 bg-gradient-to-r from-transparent to-brand-900 to-40%"
              aria-label="Rotate tabs"
            >
              <span className="text-brand-200/50 hover:text-brand-50 font-normal leading-none bg-brand-900 rounded-full px-4 transition-colors" style={{ fontSize: '38px' }}>›</span>
            </button>
          </div>
        </div>

        {/* Time picker — clock icon, clickable time (opens native picker), up/down stepper */}
        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-1">
            {/* Clock icon */}
            <svg className="w-8 h-8 text-brand-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
            {/* Date label for clarity */}
            <span className="text-brand-50/60 text-sm ml-2">
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
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
              className="w-full rounded-full bg-brand-300 px-5 py-3.5 pr-12 text-brand-50 placeholder-brand-50/75 text-base focus:outline-none focus:ring-2 focus:ring-white/20"
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

        {/* Quick add demo item — QA scaffolding to test persistence without search/scan */}
        <div className="px-6 pt-2">
          <button
            type="button"
            onClick={handleQuickAdd}
            className="w-full py-2.5 rounded-full border border-brand-200/50 text-brand-50/90 hover:text-brand-50 hover:bg-white/5 text-sm font-medium transition-colors"
          >
            Quick add demo item
          </button>
        </div>

        {/* Logged section — only shown when there is at least one item */}
        {entries.length > 0 && (
          <section className="px-6 pt-6">
            <h2 className="text-brand-50 text-xl font-semibold mb-3">Logged</h2>
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
          </section>
        )}

        {/* Bottom tabs: Saved Meals (with dropdown) / Favorites / History */}
        <section className="px-6 pt-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="relative inline-flex items-center" ref={savedMealsDropdownRef}>
              <button
                type="button"
                onClick={() => setBottomTab('saved')}
                className={`inline-flex items-center gap-1 text-xl font-semibold pb-1 transition-colors shrink-0 ${
                  bottomTab === 'saved'
                    ? 'text-brand-50 border-white'
                    : 'text-brand-50/80 border-transparent hover:text-white/70'
                }`}
              >
                Saved Meals
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSavedMealsDropdownOpen((o) => !o); }}
                className={`inline-flex items-center justify-center p-1 shrink-0 transition-colors pb-2 border-b-2 border-transparent ${
                  bottomTab === 'saved'
                    ? 'text-brand-50'
                    : 'text-brand-50/80 hover:text-white/70'
                }`}
                aria-label="Saved meals options"
                aria-expanded={savedMealsDropdownOpen}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 9l6 7 6-7H6z" />
                </svg>
              </button>
              {savedMealsDropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-lg bg-brand-800 border border-white/20 shadow-lg py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/journal/meals/create?block=${block}&date=${dateKey}&redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
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
              className={`text-xl font-semibold pb-1 mx-2 transition-colors ${
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
              className={`text-xl font-semibold pb-1 mx-2 transition-colors ${
                bottomTab === 'history'
                  ? 'text-white border-white'
                  : 'text-white/50 border-transparent hover:text-white/70'
              }`}
            >
              History
            </button>
          </div>

          {/* Horizontal scroll cards — with left/right chevrons when overflow */}
          <div className="relative -mx-4">
            {bottomTab === 'saved' && savedMealsCanScrollLeft && (
              <button
                type="button"
                onClick={() => savedMealsScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center text-brand-50/25 hover:text-brand-50/80 hover:bg-brand-900/80 py-[35px] pl-[2px] pr-[0px] transition-colors rounded-tl rounded-tl"
                aria-label="Scroll saved meals left"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            {bottomTab === 'saved' && savedMealsCanScrollRight && (
              <button
                type="button"
                onClick={() => savedMealsScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center text-brand-50/25 hover:text-brand-50/80 hover:bg-brand-900/80 py-[35px] pl-[0px] pr-[2px] transition-colors rounded-tr rounded-br"
                aria-label="Scroll saved meals right"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}
            <div
              ref={savedMealsScrollRef}
              onScroll={updateSavedMealsScrollState}
              className="flex gap-3 overflow-x-auto py-4 px-6 scrollbar-hide"
            >
              {bottomTab === 'saved' && savedMeals.length === 0 && (
                <p className="text-white/40 text-sm py-4">No saved meals yet.</p>
              )}
              {bottomTab === 'saved' && savedMeals.length > 0 && savedMeals.map((meal) => (
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
          </div>
        </section>

        {/* Create meal from logged — enabled when at least 1 intake in current day+block */}
        {entries.length > 0 && (
          <div className="px-6 pb-8">
            <Link
              href={`/journal/meals/create?block=${block}&date=${dateKey}&redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-full border border-brand-200/50 text-brand-200/50 hover:text-brand-200/100 hover:bg-white/5 text-base font-semibold transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create meal from logged
            </Link>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
