/**
 * Trusted published identity for the 50-module Baseline member version.
 *
 * These keys are the module ids the delivery API returns after a draft import.
 * Authorization uses this set plus the enrolled version id. A version key,
 * including keys generated as vN-xxxxxxxx, is not an authorization input.
 */
const DAY_ZERO_MODULE_KEYS = [
  'baseline-candidate-day-0-orientation',
  'baseline-candidate-day-0-meal-map',
  'baseline-candidate-day-0-create-meals',
  'baseline-candidate-day-0-prepare-pantry',
  'baseline-candidate-day-0-roadmap',
] as const;

const WEEK_MODULE_KEYS = [1, 2, 3].map(
  (week) => `baseline-candidate-week-${week}-context`,
);

const DAY_MODULE_KEYS = Array.from({ length: 21 }, (_, index) => {
  const day = index + 1;
  return [
    `baseline-candidate-day-${day}-practice`,
    `baseline-candidate-day-${day}-reflection`,
  ];
}).flat();

export const BASELINE_MEMBER_MODULE_KEYS: readonly string[] = [
  ...DAY_ZERO_MODULE_KEYS,
  ...WEEK_MODULE_KEYS,
  ...DAY_MODULE_KEYS,
];

/** Shape produced by create_program_version_draft. Not an allowlist. */
export const GENERATED_PROGRAM_VERSION_KEY = /^v[1-9]\d*-[0-9a-f]{8}$/;

export type PublishedBaselineModuleIdentity =
  | 'exact'
  | 'incomplete'
  | 'foreign'
  | 'unrelated';

export function classifyPublishedBaselineModules(
  modules: readonly { id: string }[],
): PublishedBaselineModuleIdentity {
  const expected = new Set(BASELINE_MEMBER_MODULE_KEYS);
  const ids = modules.map((module) => module.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) return 'foreign';

  let trusted = 0;
  let foreign = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (expected.has(id)) trusted += 1;
    else foreign += 1;
  }

  if (foreign > 0 && trusted > 0) return 'foreign';
  if (foreign > 0) return 'unrelated';
  if (trusted === 0) return 'unrelated';
  if (trusted === expected.size) return 'exact';
  return 'incomplete';
}
