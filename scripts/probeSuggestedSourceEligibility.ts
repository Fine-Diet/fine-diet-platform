/**
 * Plans Phase 28 — Diagnostic probe for the suggested-source
 * eligibility classifier.
 *
 * Usage: `npx tsx scripts/probeSuggestedSourceEligibility.ts`
 *
 * This probe does NOT touch the database. It runs the pure
 * classifier against the exact QA cases called out in the Packet 28
 * contract (§3d) so we can prove the guardrail blocks them:
 *
 *   - salt → salt & vinegar pork skins  (ineligible)
 *   - pepper → pepper jelly             (ineligible)
 *   - basil → basil butter              (ineligible)
 *
 * It also confirms legitimate partials / strong matches still flow
 * through the expected states.
 */

import { classifyMatchEntry } from '@/lib/plans/suggestedSourceEligibility';
import type { IngredientMatchEntry } from '@/lib/plans/types';

interface ProbeCase {
  label: string;
  entry: IngredientMatchEntry;
  expected: ReturnType<typeof classifyMatchEntry>['state'];
}

function makeEntry(partial: Partial<IngredientMatchEntry>): IngredientMatchEntry {
  return {
    ingredient_index: 0,
    raw_text: partial.raw_text ?? '',
    normalized_name: partial.normalized_name ?? null,
    quantity_value: null,
    quantity_unit: null,
    preparation_note: null,
    match_status: 'partial',
    confidence: 'medium',
    source_kind: 'food_object',
    source_id: 'probe-id',
    source_label: 'probe label',
    per_serving_estimate: {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    },
    explanation: null,
    ...partial,
  };
}

const CASES: ProbeCase[] = [
  // Packet 28 §3d — QA examples that must be ineligible.
  {
    label: 'salt → salt & vinegar pork skins',
    entry: makeEntry({
      normalized_name: 'salt',
      source_label: 'Salt & Vinegar Pork Skins',
      confidence: 'medium',
      match_status: 'partial',
    }),
    expected: 'ineligible',
  },
  {
    label: 'pepper → pepper jelly',
    entry: makeEntry({
      normalized_name: 'pepper',
      source_label: 'Pepper Jelly',
      confidence: 'medium',
      match_status: 'partial',
    }),
    expected: 'ineligible',
  },
  {
    label: 'basil → basil butter',
    entry: makeEntry({
      normalized_name: 'basil',
      source_label: 'Basil Butter',
      confidence: 'medium',
      match_status: 'partial',
    }),
    expected: 'ineligible',
  },

  // Legitimate cases that should still flow through.
  {
    label: 'chicken breast → chicken breast, raw (matched/high)',
    entry: makeEntry({
      normalized_name: 'chicken breast',
      source_label: 'Chicken Breast, Raw',
      confidence: 'high',
      match_status: 'matched',
    }),
    expected: 'strong',
  },
  {
    label: 'olive oil → extra virgin olive oil (medium, partial)',
    entry: makeEntry({
      normalized_name: 'olive oil',
      source_label: 'Extra Virgin Olive Oil',
      confidence: 'medium',
      match_status: 'partial',
    }),
    expected: 'review',
  },
  {
    label: 'tomato → tomato, fresh (medium, partial)',
    entry: makeEntry({
      normalized_name: 'tomato',
      source_label: 'Tomato, Fresh',
      confidence: 'medium',
      match_status: 'partial',
    }),
    expected: 'review',
  },

  // User-choice states dominate matcher output.
  {
    label: 'applied by user → applied',
    entry: makeEntry({
      normalized_name: 'tomato',
      source_label: 'Tomato, Fresh',
      user_choice: 'applied',
    }),
    expected: 'applied',
  },
  {
    label: 'rejected by user → rejected',
    entry: makeEntry({
      normalized_name: 'tomato',
      source_label: 'Tomato, Fresh',
      user_choice: 'rejected',
    }),
    expected: 'rejected',
  },

  // Heuristic / default rows have no food-object to apply.
  {
    label: 'heuristic guess → none',
    entry: makeEntry({
      normalized_name: 'xyz',
      source_kind: 'heuristic_guess',
      source_id: null,
      source_label: 'Heuristic: default',
      match_status: 'guessed',
      confidence: 'low',
    }),
    expected: 'none',
  },
];

function main(): void {
  let pass = 0;
  let fail = 0;
  console.log('─'.repeat(72));
  console.log('Plans Phase 28 — Suggested source eligibility probe');
  console.log('─'.repeat(72));
  for (const c of CASES) {
    const v = classifyMatchEntry(c.entry);
    const ok = v.state === c.expected;
    const tag = ok ? 'PASS' : 'FAIL';
    if (ok) pass++;
    else fail++;
    console.log(
      `[${tag}] ${c.label}\n       expected=${c.expected}  got=${v.state}  jaccard=${
        v.token_jaccard === null ? '—' : v.token_jaccard.toFixed(3)
      }\n       reason: ${v.reason}`,
    );
  }
  console.log('─'.repeat(72));
  console.log(`${pass} passed · ${fail} failed · ${CASES.length} total`);
  console.log('─'.repeat(72));
  if (fail > 0) process.exitCode = 1;
}

main();
