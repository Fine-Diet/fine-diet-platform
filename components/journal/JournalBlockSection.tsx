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

function MacroBar({ protein = 0, carbs = 0, fat = 0 }: MacroBarProps) {
  const hasData = protein > 0 || carbs > 0 || fat > 0;
  
  return (
    <div className="flex items-center rounded-full bg-white/10 overflow-hidden text-xs">
      <span className="px-3 py-1.5 text-white/70 border-r border-white/10">
        Fat{hasData ? ` ${fat}%` : ''}
      </span>
      <span className="px-3 py-1.5 text-white/70 border-r border-white/10">
        Protein{hasData ? ` ${protein}%` : ''}
      </span>
      <span className="px-3 py-1.5 text-white/70">
        Carbs{hasData ? ` ${carbs}%` : ''}
      </span>
    </div>
  );
}

interface JournalBlockSectionProps {
  block: TimeBlock;
  date: Date;
  redirect?: string;
  defaultExpanded?: boolean;
}

export function JournalBlockSection({
  block,
  date,
  redirect = '/journal',
  defaultExpanded = false,
}: JournalBlockSectionProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const dayKey = date.toDateString();
  useEffect(() => {
    const list = journalService.listEntriesByDayAndBlock(date, block);
    setEntries(list);
    // Auto-expand if there are entries
    if (list.length > 0 && !defaultExpanded) {
      setExpanded(true);
    }
  }, [date, block, dayKey, defaultExpanded]);

  const defaultTime = TIME_BLOCK_DEFAULTS[block];
  const dateStr = toDateKey(date);
  const logHref = `/journal/log?type=intake&block=${block}&time=${defaultTime}&date=${dateStr}&redirect=${encodeURIComponent(redirect)}`;
  const hasItems = entries.length > 0;
  
  // Build summary text from entry names
  const summary = entries.map((e) => e.payload.name || 'Item').join(', ');

  // Calculate macro percentages (placeholder - would come from actual data)
  const macros = hasItems ? { protein: 20, carbs: 60, fat: 20 } : { protein: 0, carbs: 0, fat: 0 };

  return (
    <div className="w-full rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
        aria-expanded={expanded}
      >
        <h3 className="text-white font-semibold text-2xl">{BLOCK_LABELS[block]}</h3>
        <div className="flex items-center gap-3">
          {hasItems ? (
            <Link
              href={logHref}
              onClick={(e) => e.stopPropagation()}
              className="px-4 py-1.5 rounded-full bg-white/15 border border-white/20 text-white text-sm font-medium hover:bg-white/25 transition-colors"
            >
              Add / Edit
            </Link>
          ) : (
            <span className="text-white/50">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </span>
          )}
          {/* Expand/collapse indicator */}
          <span className="text-white/60">
            {expanded ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-3">
          {/* Macro bar */}
          <MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} />

          {/* Food items summary */}
          {hasItems ? (
            <p className="text-white/80 text-sm leading-relaxed">
              {summary}
            </p>
          ) : (
            <Link
              href={logHref}
              className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add food or drinks
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
