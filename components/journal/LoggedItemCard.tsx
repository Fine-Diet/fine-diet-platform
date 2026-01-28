'use client';

import Link from 'next/link';

interface LoggedItemCardProps {
  id: string;
  name: string;
  serving?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  editHref: string;
}

/**
 * Card for a logged food item showing name, serving, and per-item macro breakdown bar.
 * MacroBar order: Protein | Carbs | Fat (matches meal-level bar).
 */
export function LoggedItemCard({
  id,
  name,
  serving = '1 Serving',
  protein = 20,
  carbs = 60,
  fat = 20,
  editHref,
}: LoggedItemCardProps) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
      {/* Header: name + serving with edit */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-medium text-base leading-tight">{name}</h3>
        <Link
          href={editHref}
          className="flex items-center gap-1 text-white/60 hover:text-white text-sm transition-colors shrink-0"
        >
          {serving}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </Link>
      </div>

      {/* Per-item macro breakdown bar: Protein | Carbs | Fat */}
      <div className="flex items-center rounded-full bg-white/10 overflow-hidden text-xs">
        <span className="flex-1 px-3 py-2 text-center text-white/70 border-r border-white/10">
          Protein {protein}%
        </span>
        <span className="flex-1 px-3 py-2 text-center text-white/70 border-r border-white/10">
          Carbs {carbs}%
        </span>
        <span className="flex-1 px-3 py-2 text-center text-white/70">
          Fat {fat}%
        </span>
      </div>
    </div>
  );
}
