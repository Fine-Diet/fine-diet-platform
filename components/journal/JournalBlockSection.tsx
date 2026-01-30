'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { TimeBlock } from '@/lib/journal';
import { journalService, TIME_BLOCK_DEFAULTS, toDateKey } from '@/lib/journal';
import type { JournalEntry } from '@/lib/journal';

const BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

interface MacroBarProps {
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** 
 * Meal-level MacroBar: visually illustrates percentage share each macro covers.
 * The width of each segment reflects its percentage of the total meal.
 * Includes a starting animation that transitions from equal widths to actual percentages.
 */
function MacroBar({ protein = 0, carbs = 0, fat = 0 }: MacroBarProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const total = protein + carbs + fat;
  
  // If no data, show equal thirds with no percentages
  const hasData = total > 0;
  const pPct = hasData ? Math.round((protein / total) * 100) : 33;
  const cPct = hasData ? Math.round((carbs / total) * 100) : 33;
  const fPct = hasData ? 100 - pPct - cPct : 34; // Remainder to ensure 100%

  // Start equal, animate to actual
  const displayP = animated ? pPct : 33;
  const displayC = animated ? cPct : 34;
  const displayF = animated ? fPct : 33;

  return (
    <div className="flex items-center rounded-full bg-gradient-to-r from-brand-200/70 to-brand-100/70 overflow-hidden text-base h-9">
      {/* Protein segment */}
      <span
        className="relative flex items-center justify-center text-brand-900 bg-white/15 h-full px-4 pt-[2px] min-w-0 truncate"
        style={{ width: `${displayP}%`, transition: 'width 0.75s ease-out' }}
      >
        <span className="truncate">
          <span className="font-semibold">Protein</span>
          {hasData ? <span className="font-light"> {protein}%</span> : ''}
        </span>
        {/* Divider: flat left, rounded right */}
        <span className="absolute right-0 top-0 h-full w-[2px] rounded-r-full bg-brand-900" aria-hidden />
      </span>
      {/* Carbs segment */}
      <span
        className="relative flex items-center justify-center text-brand-900 pt-[2px] bg-gradient-to-r from-brand-200/70 to-brand-100/70 h-full px-2 min-w-0 truncate"
        style={{ width: `${displayC}%`, transition: 'width 0.75s ease-out' }}
      >
        <span className="truncate">
          <span className="font-semibold">Carbs</span>
          {hasData ? <span className="font-light"> {carbs}%</span> : ''}
        </span>
        {/* Divider: flat left, rounded right */}
        <span className="absolute right-0 top-0 h-full w-[2px] rounded-r-full bg-brand-900" aria-hidden />
      </span>
      {/* Fat segment */}
      <span
        className="flex items-center justify-center text-brand-900 pt-[2px] bg-gradient-to-r from-brand-200/70 to-brand-100/70 h-full px-2 min-w-0 truncate"
        style={{ width: `${displayF}%`, transition: 'width 0.75s ease-out' }}
      >
        <span className="truncate">
          <span className="font-semibold">Fat</span>
          {hasData ? <span className="font-light"> {fat}%</span> : ''}
        </span>
      </span>
    </div>
  );
}

interface JournalBlockSectionProps {
  block: TimeBlock;
  date: Date;
  redirect?: string;
}

export function JournalBlockSection({
  block,
  date,
  redirect = '/journal',
}: JournalBlockSectionProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const dayKey = date.toDateString();
  useEffect(() => {
    const list = journalService.listEntriesByDayAndBlock(date, block);
    setEntries(list);
  }, [date, block, dayKey]);

  const defaultTime = TIME_BLOCK_DEFAULTS[block];
  const dateStr = toDateKey(date);
  const logHref = `/journal/log?type=intake&block=${block}&time=${defaultTime}&date=${dateStr}&redirect=${encodeURIComponent(redirect)}`;
  const hasItems = entries.length > 0;

  // Build summary as plain language list
  const summaryItems = entries.map((e) => e.payload.name || 'Item');

  // Calculate macro percentages (placeholder - would come from actual data)
  const macros = hasItems ? { protein: 20, carbs: 60, fat: 20 } : { protein: 0, carbs: 0, fat: 0 };

  return (
    <div className="flex w-full py-6 flex-col justify-center max-w-[650px] mx-auto rounded-md min-h-20 backdrop-blur-md bg-white/10 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-5">
        <h3 className="text-brand-50 font-semibold text-3xl">{BLOCK_LABELS[block]}</h3>
        {/* (+) when no items, (−) when items exist — links to log */}
        <Link
          href={logHref}
          className="text-brand/50 hover:text-white transition-colors"
          aria-label={`Log ${BLOCK_LABELS[block]} entry`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {hasItems ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            )}
          </svg>
        </Link>
      </div>

      {/* Summary content — only shown when there are items */}
      {hasItems && (
        <div className="px-5 pt-3 space-y-3">
          {/* Macro bar: visually proportional segments */}
          <MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} />

          {/* Food items summary + Add/Edit button */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-brand-50 py-[3px] text-base leading-relaxed flex-1">
              {summaryItems.join(', ')}
            </p>
            <Link
              href={logHref}
              className="shrink-0 px-3 py-[3px] rounded-full border-[1px] border-brand-50/50 text-brand-50 text-sm font-semibold hover:bg-white/25 transition-colors"
            >
              Add / Edit
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
