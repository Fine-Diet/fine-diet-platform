'use client';

import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import type { GeneratedGroceryList } from '@/lib/plans/types';
import {
  buildEligibleHaulSourceCandidates,
  formatHaulSourceListRowLabel,
  rankVisibleHaulSourceCandidates,
} from '@/lib/plans/groceryHaul/sourceListSelection';
import { groceryListTitle } from './presentation';

interface HaulSourceListPickerProps {
  lists: GeneratedGroceryList[];
  summaries: Record<string, GroceryListReadinessDecision>;
  defaultListId: string | null;
  selectedIds: string[];
  onToggle: (listId: string) => void;
  searchQuery: string;
  excludeListIds?: string[];
  emptyMessage: string;
}

export function HaulSourceListPicker({
  lists,
  summaries,
  defaultListId,
  selectedIds,
  onToggle,
  searchQuery,
  excludeListIds,
  emptyMessage,
}: HaulSourceListPickerProps) {
  const candidates = buildEligibleHaulSourceCandidates(lists, summaries, { excludeListIds });
  const visible = rankVisibleHaulSourceCandidates(candidates, {
    selectedIds,
    defaultListId,
    titleFor: groceryListTitle,
    searchQuery,
  });

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 px-4 py-4 text-sm text-white/50">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      className="max-h-[min(18rem,42dvh)] space-y-0 overflow-y-auto overscroll-contain border-y border-white/10"
      role="group"
      aria-label="Eligible Lists"
    >
      {visible.map(({ list, pendingCount }) => {
        const title = groceryListTitle(list);
        const rowLabel = formatHaulSourceListRowLabel(title, pendingCount);
        return (
          <label
            key={list.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-white/10 px-1 py-2.5 last:border-b-0 hover:bg-white/[0.04]"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(list.id)}
              onChange={() => onToggle(list.id)}
              className="h-4 w-4 shrink-0 accent-white"
            />
            <span className="text-sm font-medium text-white/90">{rowLabel}</span>
          </label>
        );
      })}
    </div>
  );
}
