'use client';

/**
 * Meal Object Foundation — Packet 9: Grouped meal log card.
 *
 * Renders a journal intake entry whose payload carries `meal_group` as a single
 * FIRST-LEVEL meal card (not a pile of flat food rows). The top-level shows the
 * meal name, consumed servings, calories/macros (when present) and a
 * needs-review badge; an expandable, READ-ONLY detail section reveals the
 * snapshot components, instructions, and instance notes.
 *
 * SCOPE / SAFETY (P9 is rendering-only):
 *   - READ-ONLY: no edit/adjust flow, no servings adjustment, no mutation of the
 *     entry or its meal_group. The only write affordance is the globally-
 *     supported entry delete (via onDelete), matching LoggedItemCard.
 *   - Visually consistent with the existing log cards (same transparent card
 *     shell, options menu, and macros bar treatment).
 *   - All display values come from a fully-defensive projection
 *     (buildGroupedMealView), so a malformed meal_group degrades gracefully.
 */

import { useEffect, useRef, useState } from 'react';
import { buildGroupedMealView } from '@/lib/meals/loggedMealGroup';

interface LoggedMealGroupCardProps {
  id: string;
  /** The grouped intake payload (must carry meal_group). */
  payload: unknown;
  onDelete?: (id: string) => void;
  /**
   * P16: open the logged-instance edit panel. Editing adjusts ONLY this logged
   * meal entry (not the source Meal Library item). Omitted ⇒ no Edit affordance.
   */
  onEdit?: (id: string) => void;
}

function matchStatusLabel(status: string): string | null {
  switch (status) {
    case 'guessed':
      return 'Estimated';
    case 'none':
      return 'Unmatched';
    default:
      return null;
  }
}

export function LoggedMealGroupCard({ id, payload, onDelete, onEdit }: LoggedMealGroupCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  const view = buildGroupedMealView(payload);

  // Defensive: if the payload somehow lost its meal_group, render a minimal,
  // non-crashing row rather than throwing on the log page.
  if (!view) {
    return (
      <div className="bg-transparent p-4">
        <h3 className="text-brand-50 text-xl font-semibold">Meal</h3>
      </div>
    );
  }

  const hasMacros =
    !!view.macros &&
    ((view.macros.protein ?? 0) > 0 ||
      (view.macros.carbs ?? 0) > 0 ||
      (view.macros.fat ?? 0) > 0);

  const servingsLabel =
    view.consumedServings != null
      ? `${Math.round(view.consumedServings * 100) / 100} ${view.unit}${view.consumedServings === 1 ? '' : 's'}`
      : null;

  const hasDetail =
    view.components.length > 0 ||
    view.steps.length > 0 ||
    !!view.instanceNotes;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(id);
    setMenuOpen(false);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit?.(id);
    setMenuOpen(false);
  };

  return (
    <div className="relative bg-transparent p-4 space-y-2">
      {/* Header: meal label + name + options menu */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <span className="text-brand-50/60 text-sm font-medium">Meal</span>
          <h3 className="text-brand-50 text-xl font-semibold">{view.name}</h3>
        </div>
        <div className="flex items-center gap-0.5 shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="p-1.5 text-brand-50 hover:text-white transition-colors rounded"
            aria-label="Options"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <svg className="w-4 h-4 text-brand-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown: Edit (P16 logged-instance edit) + Delete */}
      {menuOpen && (
        <div
          className="absolute right-4 top-12 z-50 min-w-[120px] rounded-lg bg-brand-900 border border-white/20 shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <button
              type="button"
              onClick={handleEdit}
              className="w-full text-left px-4 py-2 text-sm text-brand-50 hover:bg-white/10 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-white/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Status / source chips */}
      {(view.needsReview || view.sourceLabel) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {view.needsReview && (
            <span className="inline-flex items-center rounded-full border border-amber-300/25 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100">
              Needs review
            </span>
          )}
          {view.sourceLabel && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-brand-50/60">
              {view.sourceLabel}
            </span>
          )}
        </div>
      )}

      {/* Macros bar: Protein / Carbs / Fat — equal thirds (matches LoggedItemCard) */}
      {hasMacros && view.macros && (
        <div className="flex items-center rounded-full bg-gradient-to-r from-brand-200/70 to-brand-100/70 overflow-hidden text-base h-9">
          <span className="relative flex flex-1 items-center justify-center text-brand-900 bg-white/15 h-full px-2 pt-[2px] min-w-0 truncate">
            <span className="truncate">
              <span className="font-semibold">Protein</span>
              <span className="font-light"> {Math.round(view.macros.protein ?? 0)}g</span>
            </span>
            <span className="absolute right-0 top-0 h-full w-[3px] rounded-r-full bg-brand-900" aria-hidden />
          </span>
          <span className="relative flex flex-1 items-center justify-center text-brand-900 pt-[2px] bg-gradient-to-r from-brand-200/70 to-brand-100/70 h-full px-2 min-w-0 truncate">
            <span className="truncate">
              <span className="font-semibold">Carbs</span>
              <span className="font-light"> {Math.round(view.macros.carbs ?? 0)}g</span>
            </span>
            <span className="absolute right-0 top-0 h-full w-[3px] rounded-r-full bg-brand-900" aria-hidden />
          </span>
          <span className="flex flex-1 items-center justify-center text-brand-900 pt-[2px] bg-gradient-to-r from-brand-200/70 to-brand-100/70 h-full px-2 min-w-0 truncate">
            <span className="truncate">
              <span className="font-semibold">Fat</span>
              <span className="font-light"> {Math.round(view.macros.fat ?? 0)}g</span>
            </span>
          </span>
        </div>
      )}

      {/* Servings + calories summary row */}
      <div className="flex items-center gap-4 pt-1 text-sm">
        {servingsLabel && (
          <span className="text-brand-50/70">{servingsLabel}</span>
        )}
        {view.calories != null && (
          <span className="text-brand-50/70">{Math.round(view.calories)} cal</span>
        )}
      </div>

      {/* Expand / collapse detail */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-200/80 hover:text-brand-200 transition-colors"
        >
          {expanded ? 'Hide details' : 'Show details'}
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.08] pt-3 space-y-4">
          {view.components.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-50/40">
                Components
              </p>
              <ul className="mt-2 space-y-2">
                {view.components.map((component) => {
                  const statusLabel = component.matchStatus
                    ? matchStatusLabel(component.matchStatus)
                    : null;
                  return (
                    <li key={component.key} className="text-sm text-brand-50/75">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1">{component.name}</span>
                        {component.amount && (
                          <span className="shrink-0 text-brand-50/45">{component.amount}</span>
                        )}
                      </div>
                      {(component.prepNote ||
                        component.calories != null ||
                        component.needsReview ||
                        statusLabel) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-brand-50/40">
                          {component.prepNote && <span>{component.prepNote}</span>}
                          {component.calories != null && (
                            <span>{Math.round(component.calories)} cal</span>
                          )}
                          {component.needsReview && (
                            <span className="inline-flex items-center rounded-full border border-amber-300/25 bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-100">
                              Needs review
                            </span>
                          )}
                          {!component.needsReview && statusLabel && (
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-medium text-brand-50/50">
                              {statusLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {view.steps.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-50/40">
                Instructions
              </p>
              <ol className="mt-2 space-y-2">
                {view.steps.map((step) => (
                  <li
                    key={step.stepNumber}
                    className="flex gap-3 text-sm leading-relaxed text-brand-50/75"
                  >
                    <span className="shrink-0 font-semibold text-brand-50/40">
                      {step.stepNumber}.
                    </span>
                    <span>{step.instruction}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {view.instanceNotes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-50/40">
                Notes
              </p>
              <p className="mt-2 text-sm leading-relaxed text-brand-50/70">{view.instanceNotes}</p>
            </div>
          )}

          {!hasDetail && (
            <p className="text-sm text-brand-50/40">No additional details for this meal.</p>
          )}
        </div>
      )}
    </div>
  );
}
