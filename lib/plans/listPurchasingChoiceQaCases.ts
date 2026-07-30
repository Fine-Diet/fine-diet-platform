/**
 * Deterministic PR3 QA case catalog for founder review.
 * Pure documentation + helpers — no DB writes.
 */

export type ListResolveQaCaseId =
  | 'matched'
  | 'typo'
  | 'ambiguous'
  | 'unresolved'
  | 'list_only'
  | 'save_to_source'
  | 'remember_for_future';

export interface ListResolveQaCase {
  id: ListResolveQaCaseId;
  title: string;
  setup: string;
  expected: string;
}

export const LIST_RESOLVE_QA_CASES: ListResolveQaCase[] = [
  {
    id: 'matched',
    title: 'Exact match resolve',
    setup: 'Unresolved row with a clear canonical food (e.g. baby spinach).',
    expected:
      'Use for this list writes purchasing choice only; grocery_items.food_object_id unchanged; row shows list shopping label.',
  },
  {
    id: 'typo',
    title: 'Typo / cleaned name',
    setup: 'Required name has extra words or misspelling; search finds the intended food.',
    expected: 'List choice stores grounded food; required name snapshot preserves original text.',
  },
  {
    id: 'ambiguous',
    title: 'Ambiguous search',
    setup: 'Search returns multiple similar foods.',
    expected: 'Owner must pick one; no silent person/plan write unless opt-in checked.',
  },
  {
    id: 'unresolved',
    title: 'Leave unresolved',
    setup: 'No food selected / clear list choice.',
    expected: 'Choice removed; row falls back to required name; haul uses provenance match key.',
  },
  {
    id: 'list_only',
    title: 'List-only (default)',
    setup: 'Resolve with both opt-ins unchecked.',
    expected: 'Only grocery_list_purchasing_choices row written; no person resolution; no plan override.',
  },
  {
    id: 'save_to_source',
    title: 'Save to source plan (opt-in)',
    setup: 'Plan-contributed row whose plan the owner owns; check Save to source plan.',
    expected: 'List choice + shopping override under provenance plan+dates; refuse if plan not owned.',
  },
  {
    id: 'remember_for_future',
    title: 'Remember for future (opt-in)',
    setup: 'Check Remember for future on resolve.',
    expected: 'Person grocery_ingredient_resolutions updated; receipt timestamp on choice.',
  },
];

export function isListResolveQaEnabled(
  qaParam: string | string[] | undefined,
): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const value = Array.isArray(qaParam) ? qaParam[0] : qaParam;
  return value === 'cases';
}
