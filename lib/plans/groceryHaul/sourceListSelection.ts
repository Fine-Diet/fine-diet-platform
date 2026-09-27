import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import type { GeneratedGroceryList } from '@/lib/plans/types';

export interface HaulSourceListCandidate {
  list: GeneratedGroceryList;
  pendingCount: number;
}

export function pendingCountForList(
  listId: string,
  summaries: Record<string, GroceryListReadinessDecision>,
): number {
  return summaries[listId]?.counts.pending ?? 0;
}

export function buildEligibleHaulSourceCandidates(
  lists: GeneratedGroceryList[],
  summaries: Record<string, GroceryListReadinessDecision>,
  options?: { excludeListIds?: Iterable<string> },
): HaulSourceListCandidate[] {
  const excluded = new Set(options?.excludeListIds ?? []);
  return lists
    .filter(
      (list) =>
        list.status === 'active'
        && !list.archived_at
        && !excluded.has(list.id),
    )
    .map((list) => ({
      list,
      pendingCount: pendingCountForList(list.id, summaries),
    }))
    .filter(({ pendingCount }) => pendingCount > 0);
}

function compareUnselectedCandidates(
  a: HaulSourceListCandidate,
  b: HaulSourceListCandidate,
  defaultListId: string | null,
  titleFor: (list: GeneratedGroceryList) => string,
): number {
  const aDefault = Boolean(defaultListId && a.list.id === defaultListId);
  const bDefault = Boolean(defaultListId && b.list.id === defaultListId);
  if (aDefault !== bDefault) return aDefault ? -1 : 1;

  const aUpdated = Date.parse(a.list.updated_at);
  const bUpdated = Date.parse(b.list.updated_at);
  if (aUpdated !== bUpdated) return bUpdated - aUpdated;

  return titleFor(a.list).localeCompare(titleFor(b.list), undefined, { sensitivity: 'base' });
}

/** Selected rows pin first; search filters only the unselected portion. */
export function rankVisibleHaulSourceCandidates(
  candidates: HaulSourceListCandidate[],
  options: {
    selectedIds: string[];
    defaultListId: string | null;
    titleFor: (list: GeneratedGroceryList) => string;
    searchQuery?: string;
  },
): HaulSourceListCandidate[] {
  const byId = new Map(candidates.map((candidate) => [candidate.list.id, candidate]));
  const selected: HaulSourceListCandidate[] = [];
  for (const id of options.selectedIds) {
    const candidate = byId.get(id);
    if (candidate) selected.push(candidate);
  }

  const selectedSet = new Set(options.selectedIds);
  let unselected = candidates.filter((candidate) => !selectedSet.has(candidate.list.id));

  const needle = options.searchQuery?.trim().toLocaleLowerCase() ?? '';
  if (needle) {
    unselected = unselected.filter((candidate) =>
      options.titleFor(candidate.list).toLocaleLowerCase().includes(needle),
    );
  }

  unselected.sort((a, b) =>
    compareUnselectedCandidates(a, b, options.defaultListId, options.titleFor),
  );

  return [...selected, ...unselected];
}

export function formatHaulSourceListRowLabel(title: string, pendingCount: number): string {
  const noun = pendingCount === 1 ? 'item' : 'items';
  return `${title} - ${pendingCount} ${noun}`;
}
