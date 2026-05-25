'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { TimeBlock, JournalEntry, Flag, FoodNutrientData } from '@/lib/journal';
import { TIME_BLOCK_DEFAULTS, toDateKey, computeFlags, getFlagSeverityBg } from '@/lib/journal';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { formatFoodNameString } from '@/lib/food';
import { MealProteinScore } from './NDSDisplay';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';

const BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

// Meal guidance signals are being held back from the Meals module UI for now.
// Keep the computations below available so they can be reviewed and reused elsewhere.
const SHOW_MEAL_GUIDANCE_SIGNALS = false;

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
              <li key={flag.key} className="text-base">
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

interface JournalBlockSectionProps {
  block?: TimeBlock;
  mealSlot?: ResolvedScheduleSlot;
  date: Date;
  /** Pre-filtered entries for this block or meal slot (passed from parent) */
  entries: JournalEntry[];
  /** Food nutrient data map for flag computation */
  foodNutrientMap?: Map<string, FoodNutrientData>;
  redirect?: string;
  /** Whether to show NDS meal indicators (feature flag) */
  showNDSIndicators?: boolean;
}

export function JournalBlockSection({
  block,
  mealSlot,
  date,
  entries,
  foodNutrientMap = new Map(),
  redirect = APP_ROUTES.log,
  showNDSIndicators = false,
}: JournalBlockSectionProps) {
  const sectionBlock = (mealSlot?.slot_block ?? block ?? 'morning') as TimeBlock;
  const sectionLabel = mealSlot?.label ?? BLOCK_LABELS[sectionBlock];
  const defaultTime = mealSlot?.target_time ?? TIME_BLOCK_DEFAULTS[sectionBlock];
  const dateStr = toDateKey(date);
  const mealSlotParam = mealSlot ? `&mealSlot=${mealSlot.key}` : '';
  const logHref = `${APP_ROUTES.logNew}?type=intake&block=${sectionBlock}&time=${defaultTime}&date=${dateStr}${mealSlotParam}&redirect=${encodeURIComponent(redirect)}`;
  const hasItems = entries.length > 0;

  // Build summary as plain language list (format stored names)
  const getEntrySummaryLabel = (e: JournalEntry): string => {
    if (e.type === 'intake') {
      return formatFoodNameString((e.payload as { name?: string }).name || 'Item');
    }
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case 'water': return `${p.amount ?? '?'} ${p.unit ?? 'oz'} water`;
      case 'supplement': return `${p.name ?? 'Supplement'}${p.dose != null ? ` ${p.dose}${p.unit ? ` ${p.unit}` : ''}` : ''}`;
      case 'mood': return `Mood ${p.score ?? '?'}/10`;
      case 'bowel': return `Bristol ${p.bristol ?? '?'}`;
      case 'cycle': return p.phase ? String(p.phase) : p.cycleDay != null ? `Day ${p.cycleDay}` : 'Cycle';
      case 'movement': return `${p.type ?? 'Activity'} · ${p.minutes ?? '?'} min`;
      case 'blood_pressure': return `${p.systolic ?? '?'}/${p.diastolic ?? '?'} mmHg`;
      default: return 'Entry';
    }
  };
  const summaryItems = entries.map(getEntrySummaryLabel);

  // Calculate block calories from entries (scaled by quantity) — intake only
  let blockCalories = 0;
  for (const entry of entries) {
    if (entry.type === 'intake') {
      const ip = entry.payload as { calories?: number; quantity?: number };
      if (typeof ip.calories === 'number') {
        const qty = ip.quantity ?? 1;
        blockCalories += ip.calories * qty;
      }
    }
  }
  const showCalories = blockCalories > 0;

  // Calculate macro totals from entries (scaled by quantity), then convert to percentages for display — intake only
  const macroTotals = { protein: 0, carbs: 0, fat: 0 };
  for (const entry of entries) {
    if (entry.type !== 'intake') continue;
    const ip = entry.payload as { macros?: { protein?: number; carbs?: number; fat?: number }; quantity?: number };
    if (ip.macros) {
      const qty = ip.quantity ?? 1;
      macroTotals.protein += (ip.macros.protein ?? 0) * qty;
      macroTotals.carbs += (ip.macros.carbs ?? 0) * qty;
      macroTotals.fat += (ip.macros.fat ?? 0) * qty;
    }
  }
  const macroSummaryLine = `${Math.round(blockCalories)} Cal - P ${Math.round(macroTotals.protein)}g - C ${Math.round(macroTotals.carbs)}g - F ${Math.round(macroTotals.fat)}g`;

  // Compute nutrient flags for this block
  const flags = computeFlags({ entries, foodNutrientMap });
  const hasFlags = flags.length > 0;
  const topFlag = flags[0];

  // Aggregate NDS meal data for this block (only if feature enabled)
  // Only show protein score for main meals (>=250 kcal).
  // Non-main meals should have NO protein score reaction per spec.
  let blockProteinScore: number | null = null;
  let hasMainMeal = false;
  if (showNDSIndicators) {
    const mainMealsWithPS = entries.filter(
      (e) => e.isMainMeal === true && e.proteinScore10 !== null && e.proteinScore10 !== undefined
    );
    hasMainMeal = mainMealsWithPS.length > 0;
    if (mainMealsWithPS.length > 0) {
      const sum = mainMealsWithPS.reduce((acc, e) => acc + (e.proteinScore10 ?? 0), 0);
      blockProteinScore = sum / mainMealsWithPS.length;
    }
  }

  // Popover state
  const [showPopover, setShowPopover] = useState(false);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  // Close popover handler
  const handleClosePopover = useCallback(() => setShowPopover(false), []);

  return (
    <div className="flex w-full flex-col justify-center">
      {/* Header row */}
      <div className="px-6 pt-7">
        <h3 className="text-brand-50 font-semibold text-sm antialiased pb-[2px]">{sectionLabel}</h3>
      </div>

      {!hasItems && (
        <div className="px-5 pb-8 pt-3">
          <Link
            href={logHref}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-transparent bg-denim-500 px-5 py-2 text-base font-semibold text-black transition-colors hover:bg-denim-700"
          >
            Add Your Meal
          </Link>
        </div>
      )}

      {/* Summary content — only shown when there are items */}
      {hasItems && (
        <div className="px-6 pb-8 pt-1">
          <div className="flex min-w-0 items-center">
            <p className="min-w-0 flex-1 truncate text-sm font-regular text-brand-50/80 antialiased pb-[2px]">
              {showCalories ? macroSummaryLine : 'Calories and macros pending'}
            </p>
            {/* NDS: Meal protein score — only for main meals (>=250 kcal) */}
            {SHOW_MEAL_GUIDANCE_SIGNALS && showNDSIndicators && hasMainMeal && blockProteinScore !== null && (
              <MealProteinScore proteinScore10={blockProteinScore} isMainMeal={hasMainMeal} />
            )}

            {/* Flag indicator — after calories, before items */}
            {SHOW_MEAL_GUIDANCE_SIGNALS && hasFlags && (
              <div className="shrink-0">
                <button
                  ref={triggerButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPopover((prev) => !prev);
                  }}
                  className={`w-4 h-2 p-1 rounded-full flex items-center justify-center ${getFlagSeverityBg(topFlag.severity)} opacity-75 hover:opacity-100 transition-opacity`}
                  aria-label={`${flags.length} nutrient ${flags.length === 1 ? 'flag' : 'flags'}`}
                  aria-expanded={showPopover}
                >
                  <svg className="w-3 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
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

          </div>
          <p className="truncate text-sm leading-relaxed text-brand-50/80 antialiased">
            {summaryItems.join(', ')}
          </p>
          <Link
            href={logHref}
            className="mt-2 inline-flex min-h-5 w-full items-center justify-center rounded-full border border-transparent bg-denim-500 px-4 py-2 text-base font-semibold text-black transition-colors hover:bg-denim-700"
          >
            Add/Edit
          </Link>
        </div>
      )}
    </div>
  );
}
