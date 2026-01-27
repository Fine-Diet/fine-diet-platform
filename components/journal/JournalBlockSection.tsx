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

interface JournalBlockSectionProps {
  block: TimeBlock;
  date: Date;
  redirect?: string;
}

export function JournalBlockSection({ block, date, redirect = '/journal' }: JournalBlockSectionProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [collapsed, setCollapsed] = useState(true);

  const dayKey = date.toDateString();
  useEffect(() => {
    const list = journalService.listEntriesByDayAndBlock(date, block);
    setEntries(list);
  }, [date, block, dayKey]);

  const defaultTime = TIME_BLOCK_DEFAULTS[block];
  const dateStr = toDateKey(date);
  const logHref = `/journal/log?type=intake&block=${block}&time=${defaultTime}&date=${dateStr}&redirect=${encodeURIComponent(redirect)}`;
  const hasItems = entries.length > 0;
  const summary =
    entries.length === 0
      ? null
      : entries.map((e) => e.payload.name || 'Item').join(', ');

  return (
    <div className="w-full rounded-xl backdrop-blur-sm border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
        aria-expanded={!collapsed}
      >
        <h3 className="text-white font-regular text-xl">{BLOCK_LABELS[block]}</h3>
        <div className="flex items-center gap-2">
          {hasItems && (
            <span className="text-white/70 text-sm max-w-[140px] truncate">
              {summary}
            </span>
          )}
          <span className="text-white/80">
            {collapsed ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            )}
          </span>
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 border-t border-white/5">
          {hasItems && (
            <div className="flex flex-wrap gap-2 pt-3 mb-3">
              <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/80">P —</span>
              <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/80">C —</span>
              <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/80">F —</span>
            </div>
          )}
          <Link
            href={logHref}
            className="inline-flex items-center gap-2 text-white/90 hover:text-white text-sm"
          >
            {hasItems ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add
              </>
            )}
          </Link>
        </div>
      )}
    </div>
  );
}
