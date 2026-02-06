'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { TimeBlock, JournalEntry, Flag, FoodNutrientData } from '@/lib/journal';
import { TIME_BLOCK_DEFAULTS, toDateKey, computeFlags, getFlagSeverityBg } from '@/lib/journal';
import { formatFoodNameString } from '@/lib/food';

const BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

// ============================================================================
// Flag Popover (Portal-based to escape overflow:hidden)
// ============================================================================

interface FlagPopoverProps {
  flags: Flag[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

function FlagPopover({ flags, triggerRef, onClose }: FlagPopoverProps) {
  const [position, setPosition] = useState<{ top: number; left: number; flipUp: boolean }>({
    top: 0,
    left: 0,
    flipUp: false,
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Calculate position on mount and window resize/scroll
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 256; // w-64 = 16rem = 256px
    const popoverHeight = 150; // Approximate height
    const gap = 8; // mt-2 equivalent

    // Check if popover would overflow bottom of viewport
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < popoverHeight + gap;

    // Position right-aligned with trigger
    let left = rect.right - popoverWidth;
    // Ensure it doesn't go off-screen left
    if (left < 8) left = 8;
    // Ensure it doesn't go off-screen right
    if (left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    }

    const top = flipUp
      ? rect.top - gap // Position above, will use bottom anchor in CSS
      : rect.bottom + gap;

    setPosition({ top, left, flipUp });
  }, [triggerRef]);

  // Mount check for SSR safety
  useEffect(() => {
    setMounted(true);
    updatePosition();
  }, [updatePosition]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!mounted) return;

    const handleUpdate = () => updatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [mounted, updatePosition]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, triggerRef]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!mounted || flags.length === 0) return null;

  const topFlag = flags[0];

  const popoverContent = (
    <div
      ref={popoverRef}
      className="fixed z-[9999] w-64 rounded-lg bg-brand-800 border border-white/20 shadow-xl overflow-hidden"
      style={{
        top: position.flipUp ? 'auto' : position.top,
        bottom: position.flipUp ? window.innerHeight - position.top : 'auto',
        left: position.left,
      }}
    >
      {/* Top flag (highlighted) */}
      <div
        className={`px-4 py-3 ${
          topFlag.severity === 'high'
            ? 'bg-red-500/20'
            : topFlag.severity === 'warn'
            ? 'bg-yellow-500/20'
            : 'bg-blue-500/20'
        }`}
      >
        <div
          className={`font-semibold text-sm ${
            topFlag.severity === 'high'
              ? 'text-red-300'
              : topFlag.severity === 'warn'
              ? 'text-yellow-300'
              : 'text-blue-300'
          }`}
        >
          {topFlag.title}
        </div>
        <p className="text-white/80 text-sm mt-0.5">{topFlag.message}</p>
      </div>

      {/* Additional flags */}
      {flags.length > 1 && (
        <div className="px-4 py-2 border-t border-white/10">
          <ul className="space-y-1.5">
            {flags.slice(1).map((flag) => (
              <li key={flag.key} className="text-sm">
                <span
                  className={`font-medium ${
                    flag.severity === 'high'
                      ? 'text-red-400'
                      : flag.severity === 'warn'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`}
                >
                  {flag.title}:
                </span>
                <span className="text-white/70 ml-1">{flag.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return createPortal(popoverContent, document.body);
}

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
  /** Pre-filtered entries for this block (passed from parent) */
  entries: JournalEntry[];
  /** Food nutrient data map for flag computation */
  foodNutrientMap?: Map<string, FoodNutrientData>;
  redirect?: string;
}

export function JournalBlockSection({
  block,
  date,
  entries,
  foodNutrientMap = new Map(),
  redirect = '/journal',
}: JournalBlockSectionProps) {
  const defaultTime = TIME_BLOCK_DEFAULTS[block];
  const dateStr = toDateKey(date);
  const logHref = `/journal/log?type=intake&block=${block}&time=${defaultTime}&date=${dateStr}&redirect=${encodeURIComponent(redirect)}`;
  const hasItems = entries.length > 0;

  // Build summary as plain language list (format stored names)
  const summaryItems = entries.map((e) => formatFoodNameString(e.payload.name || 'Item'));

  // Calculate block calories from entries
  let blockCalories = 0;
  for (const entry of entries) {
    if (entry.type === 'intake' && typeof entry.payload.calories === 'number') {
      blockCalories += entry.payload.calories;
    }
  }
  const showCalories = blockCalories > 0;

  // Calculate macro totals from entries, then convert to percentages for display
  const macroTotals = { protein: 0, carbs: 0, fat: 0 };
  for (const entry of entries) {
    if (entry.payload.macros) {
      macroTotals.protein += entry.payload.macros.protein ?? 0;
      macroTotals.carbs += entry.payload.macros.carbs ?? 0;
      macroTotals.fat += entry.payload.macros.fat ?? 0;
    }
  }
  const totalMacroGrams = macroTotals.protein + macroTotals.carbs + macroTotals.fat;
  const macros = totalMacroGrams > 0
    ? {
        protein: Math.round((macroTotals.protein / totalMacroGrams) * 100),
        carbs: Math.round((macroTotals.carbs / totalMacroGrams) * 100),
        fat: Math.round((macroTotals.fat / totalMacroGrams) * 100),
      }
    : { protein: 0, carbs: 0, fat: 0 };

  // Compute nutrient flags for this block
  const flags = computeFlags({ entries, foodNutrientMap });
  const hasFlags = flags.length > 0;
  const topFlag = flags[0];

  // Popover state
  const [showPopover, setShowPopover] = useState(false);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  // Close popover handler
  const handleClosePopover = useCallback(() => setShowPopover(false), []);

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
          {/* Macro bar */}
          <MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} />

          {/* Summary row: [calories] [flag] [items text] [Add/Edit] */}
          <div className="flex items-center gap-2">
            {/* Block calories — only shown if > 0 */}
            {showCalories && (
              <span className="shrink-0 text-brand-50 text-base py-[3px]">
                <span className="font-semibold">{Math.round(blockCalories)}</span>
                <span className="font-normal">cal</span>
              </span>
            )}

            {/* Flag indicator — after calories, before items */}
            {hasFlags && (
              <div className="shrink-0">
                <button
                  ref={triggerButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPopover((prev) => !prev);
                  }}
                  className={`w-4 h-4 p-1 rounded-full flex items-center justify-center ${getFlagSeverityBg(topFlag.severity)} opacity-75 hover:opacity-100 transition-opacity`}
                  aria-label={`${flags.length} nutrient ${flags.length === 1 ? 'flag' : 'flags'}`}
                  aria-expanded={showPopover}
                >
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Portal-based popover (escapes overflow:hidden) */}
                {showPopover && (
                  <FlagPopover
                    flags={flags}
                    triggerRef={triggerButtonRef}
                    onClose={handleClosePopover}
                  />
                )}
              </div>
            )}

            {/* Items summary — flexible, truncates if needed */}
            <p className="text-brand-50 py-[3px] text-base leading-relaxed flex-1 min-w-0 truncate">
              {summaryItems.join(', ')}
            </p>

            {/* Add/Edit button — always at right */}
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
