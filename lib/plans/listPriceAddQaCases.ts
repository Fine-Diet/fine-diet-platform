/**
 * Deterministic PR3.2a / PR3.2b QA case catalogs for founder review.
 */

export type ListPriceAddQaCase = {
  id: string;
  title: string;
  expected: string;
};

export const LIST_PRICE_ADD_QA_CASES: ListPriceAddQaCase[] = [
  {
    id: 'quote-pool-multi-retailer',
    title: 'Two+ retailer quotes on one item',
    expected: 'Saved quotes expand under the row; both retailers remain visible in the pool.',
  },
  {
    id: 'select-active-quote',
    title: 'Select a saved quote as active',
    expected: 'Active badge moves; Full Haul merchandise updates; selection survives reload.',
  },
  {
    id: 'newest-compatible-fallback',
    title: 'No explicit active quote',
    expected: 'Newest compatible quote is used for Full Haul.',
  },
  {
    id: 'mixed-retailers-label',
    title: 'Mixed active retailers',
    expected: 'Full Haul shows Mixed retailers when active quotes span retailers.',
  },
  {
    id: 'choice-change-stale-active',
    title: 'Change purchasing choice after active quote',
    expected: 'Incompatible active quote becomes stale; haul falls back or unprices safely.',
  },
  {
    id: 'manual-blueberries-haul',
    title: 'Manual blueberries → Find price → Full Haul',
    expected: 'List quote feeds Full Haul immediately and after reload.',
  },
  {
    id: 'typo-brest',
    title: 'Add “brest” / “chiken brest”',
    expected: 'Explicit Did you mean; raw phrase preserved.',
  },
  {
    id: 'sort-newest',
    title: 'Sort modes',
    expected: 'Newest-first default; selection persists.',
  },
];

/** PR3.2b — retailer scenario preview + Apply. */
export const LIST_RETAILER_SCENARIO_QA_CASES: ListPriceAddQaCase[] = [
  {
    id: 'scenario-selector',
    title: 'Retailer scenario selector',
    expected:
      'Current list estimate is default; retailers from quote pools appear; selecting one shows Preview only.',
  },
  {
    id: 'scenario-matched',
    title: 'Matched rows',
    expected:
      'Items with a fresh compatible quote at that retailer show matched and contribute to preview haul.',
  },
  {
    id: 'scenario-missing',
    title: 'Missing rows',
    expected:
      'Items without a quote at that retailer show missing; Find price prefills the scenario retailer.',
  },
  {
    id: 'scenario-stale',
    title: 'Stale rows',
    expected:
      'TTL-expired or incompatible quotes at that retailer show stale and are not in Apply selections.',
  },
  {
    id: 'scenario-preview-only',
    title: 'Preview does not mutate actives',
    expected:
      'Changing the retailer leaves saved actives unchanged until Use these prices for this list.',
  },
  {
    id: 'scenario-apply',
    title: 'Apply matched prices',
    expected:
      'Use these prices sets actives for matched only; Full Haul updates; reload keeps the new actives.',
  },
];

export function isListPriceAddQaEnabled(queryValue: unknown): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return (
    queryValue === 'cases' ||
    queryValue === 'quotes' ||
    queryValue === 'scenario'
  );
}

export function isListRetailerScenarioQaEnabled(queryValue: unknown): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return queryValue === 'scenario';
}
