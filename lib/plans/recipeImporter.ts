/**
 * Plans — Recipe / Meal Importer (Phase 4)
 *
 * Pure, deterministic, provider-free parser for pasted text and URLs.
 * Packet 4 ships the stub importer only. A future packet can add a
 * provider-backed variant (OpenAI / Anthropic / scraper) behind the
 * same `runRecipeImport()` contract — just like the AI gateway.
 *
 * Contract highlights (locked in Packet 4):
 *   - Missing / ambiguous input never silently downgrades to an
 *     untyped blob. We return `parse_status: 'manual_review'` (or
 *     `'failed'` on hard errors) with raw input preserved.
 *   - Ingredient matching is conservative: never auto-promotes an
 *     estimate to curated truth. Match source is always explicit.
 *   - NDS meal-derived output uses the existing lib/nds pipeline via
 *     computeMealDerivedFromPayload(); no new NDS math is introduced.
 *   - Food trust and NDS confidence stay distinct: nutrition-estimate
 *     confidence is surfaced separately from meal-level NDS confidence.
 */

import { computeMealDerivedFromPayload } from '@/lib/nds/mealDerived';
import type { MealDerivedData } from '@/lib/nds/types';
import type {
  ImportedMealDraftIngredient,
  ImportedMealDraftPayload,
  ImportedMealDraftStep,
  ImportedMealImportType,
  ImportedMealParseStatus,
  ImportedMealSourceType,
  ImportedMealTypeHint,
  IngredientMatchEntry,
  NutritionEstimate,
  NutritionEstimateConfidence,
  NutritionEstimatePerServing,
  NDSConfidence,
  PlannedMealPayload,
} from './types';
import {
  buildAttachablePayloadFromMatches,
  matchIngredients,
  matchIngredientsHeuristicOnly,
  type IngredientLookup,
  type IngredientsMatchedResult,
} from './ingredientMatcher';
import {
  CONTAINS_UNIT_RE,
  LEADING_QUANTITY_RE,
  parseIngredientPhrase,
} from './ingredientPhraseParser';

// ============================================================================
// Input normalization
// ============================================================================

export interface RecipeImportInput {
  text?: string | null;
  url?: string | null;
  source_platform?: string | null;
  user_hint?: string | null;
}

export interface RecipeImportResult {
  title: string;
  import_type: ImportedMealImportType;
  source_type: ImportedMealSourceType;
  source_url: string | null;
  source_platform: string | null;
  raw_input_text: string | null;
  parse_status: ImportedMealParseStatus;
  parsed_payload_json: ImportedMealDraftPayload | null;
  nutrition_estimate_json: NutritionEstimate | null;
  ingredient_match_json: IngredientMatchEntry[] | null;
  payload: PlannedMealPayload;
  /** Meal-level NDS shape derived from the attachable payload. */
  nds: {
    protein_score_10: number | null;
    is_main_meal: boolean;
    psq_multiplier: number;
    meal_derived_data: MealDerivedData;
    nds_confidence: NDSConfidence;
  };
}

const VIDEO_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'instagram.com',
  'www.instagram.com',
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
  'facebook.com',
  'www.facebook.com',
  'fb.watch',
]);

const PLATFORM_MAP: Array<{ match: RegExp; platform: string }> = [
  { match: /youtube\.com|youtu\.be/, platform: 'youtube' },
  { match: /tiktok\.com/, platform: 'tiktok' },
  { match: /instagram\.com/, platform: 'instagram' },
  { match: /facebook\.com|fb\.watch/, platform: 'facebook' },
  { match: /pinterest\./, platform: 'pinterest' },
  { match: /reddit\.com/, platform: 'reddit' },
];

export function detectSourcePlatform(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const p of PLATFORM_MAP) if (p.match.test(host)) return p.platform;
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isLikelyVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return VIDEO_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function classifyInput(input: RecipeImportInput): {
  import_type: ImportedMealImportType;
  source_type: ImportedMealSourceType;
} {
  const hasText = typeof input.text === 'string' && input.text.trim().length > 0;
  const hasUrl = typeof input.url === 'string' && input.url.trim().length > 0;
  if (hasUrl && isLikelyVideoUrl(input.url as string)) {
    return { import_type: 'video', source_type: 'video' };
  }
  if (hasUrl) return { import_type: 'url', source_type: 'url' };
  if (hasText) return { import_type: 'pasted_text', source_type: 'manual' };
  return { import_type: 'pasted_text', source_type: 'manual' };
}

// ============================================================================
// Text parsing (deterministic)
// ============================================================================

// The actual ingredient-phrase parser (Unicode fractions, ranges,
// parentheticals, size adjectives, count-inferred fallback, parse
// confidence) now lives in `./ingredientPhraseParser.ts` so the
// server importer and the draft review UI share a single hardened
// implementation. See Plans Phase 24.
function parseIngredientLine(line: string): ImportedMealDraftIngredient {
  const phrase = parseIngredientPhrase(line);
  return {
    raw_text: phrase.raw_text,
    normalized_name: phrase.normalized_name,
    quantity_value: phrase.quantity_value,
    quantity_unit: phrase.quantity_unit,
    preparation_note: phrase.preparation_note,
    parse_confidence: phrase.parse_confidence,
    quantity_source: phrase.quantity_source,
  };
}

interface ParsedSections {
  title: string | null;
  description: string | null;
  servings: number | null;
  ingredientLines: string[];
  stepLines: string[];
}

const INGREDIENTS_HEADER_RE =
  /^(?:ingredients?|what you('?| )ll need|you('?| )ll need|shopping list)\b/i;
const STEPS_HEADER_RE =
  /^(?:instructions?|directions?|method|methods?|steps?|preparation|procedure|how to (?:make|prepare|cook)|to (?:make|prepare|cook))\b/i;

// Packet 33 — Servings / yield recovery patterns.
//
// 1. Prefix form: "serves 4", "Servings: 4", "Makes 12 cookies",
//    "Yield: 2 loaves", "Portions: 6", "For 4 people". Accepts an
//    optional range ("serves 4-6", "serves 4 to 6"); ranges collapse
//    to the rounded midpoint so the downstream nutrition estimator
//    still gets a single servings anchor.
// 2. Leading-number form: "4 servings", "6 portions" at the start
//    of an otherwise-empty line. Bounded to 1-99 to avoid matching
//    real ingredient rows like "4 eggs".
//
// The "for N people|persons|guests" form is kept narrow on purpose:
// only the three trailing nouns below qualify so we don't over-match
// cookbook prose like "for 4 hours".
// Packet 34 — The prefix regex is intentionally `g`lobal. A single
// transcript-recovered line can easily carry both a `for N hours`
// step-prose fragment and a `serves N` yield cue; if we only ran the
// non-global regex once, the first `for` hit would fail the person-noun
// guard and return null, missing the real servings later in the line.
// `extractServings` now walks every match, applies the guard per hit,
// and keeps the last valid value (preserves pre-Packet-34 last-match-
// wins semantics across lines).
const SERVINGS_PREFIX_RE =
  /(?:\b|^)(?:serves?|servings?|yields?|makes?|portions?|for)[:\s]+(\d+(?:\.\d+)?)(?:\s*(?:-|to|–|—)\s*(\d+(?:\.\d+)?))?\b(?:\s+(people|persons|guests|pax))?/gi;

const SERVINGS_LEADING_RE =
  /^(\d{1,2})\s+(servings?|portions?|yields?|pax)\b/i;

// Packet 34 — Dominant servings-line guard.
//
// A "dominant" servings line is one whose content is *primarily*
// about yield ("Serves 4", "4 servings", "Makes 2 bowls",
// "Yield: 2 loaves"). The line is captured for servings AND then
// skipped so it doesn't also land in the title slot, description
// preamble, or ingredient list. Without this guard, pastes that
// put servings before the recipe title or inside the ingredient
// block produced ghost rows like "4 whole servings" in the draft.
//
// The patterns are deliberately anchored to both ends so narrative
// mid-line matches (e.g. "1 cup milk (serves 4)") still flow
// through the normal per-line handling. Trailing common yield
// nouns are allowed so "Makes 2 bowls" / "Yield: 2 loaves" count
// as dominant even with a noun after the number.
const DOMINANT_SERVINGS_PREFIX_RE =
  /^(?:serves?|servings?|yields?|makes?|portions?|for)[:\s]+\d+(?:\.\d+)?(?:\s*(?:-|to|–|—)\s*\d+(?:\.\d+)?)?(?:\s+(?:people|persons|guests|pax|servings?|portions?|bowls?|cookies?|loaves|loaf|muffins?|cups?|buns?|rolls?|pieces?|portions?|biscuits?|bars?|brownies?|pancakes?|waffles?|cakes?))?\s*\.?\s*$/i;

const DOMINANT_SERVINGS_LEADING_RE =
  /^\d{1,2}\s+(?:servings?|portions?|yields?|pax)\s*\.?\s*$/i;

// Heuristic: does a line look like an ingredient (leading quantity,
// fraction, bullet with measurement, or short text with a measurement
// word)? We use this to recover ingredient blocks in pastes that lack
// an "Ingredients" header. Regexes are imported from the shared
// `ingredientPhraseParser` module so the server detection heuristic
// and the structured parser stay in sync (Packet 24).
function looksLikeIngredientLine(line: string): boolean {
  if (LEADING_QUANTITY_RE.test(line)) return true;
  if (line.length <= 80 && CONTAINS_UNIT_RE.test(line) && /\d/.test(line)) return true;
  return false;
}

// Heuristic: does a line look like an instruction / step? We use this
// to detect the ingredients→steps transition in pastes that lack an
// "Instructions" header. Instruction-leak bug (Packet 4 QA): without
// this check, prose lines like "Preheat the oven to 400°F and toss the
// vegetables with oil" were collected as ingredients, inflating the
// nutrition estimate and degrading meal-level NDS scoring.
function looksLikeInstructionLine(line: string): boolean {
  // Numbered step ("1. ", "1) ")
  if (/^\d+[.)]\s+\S/.test(line)) return true;
  // Prose-y: long line with multiple sentences / verbs, no leading qty.
  if (!LEADING_QUANTITY_RE.test(line) && line.length > 90) return true;
  // Common imperative step starters at the beginning of a line.
  if (
    /^(?:preheat|heat|add|stir|mix|combine|whisk|bake|roast|saute|sauté|fry|cook|simmer|boil|pour|season|serve|garnish|let|allow|cover|remove|transfer|place|toss|drizzle|spread|fold|beat|blend|chop|slice|dice|mince|grate|refrigerate|chill|rest|drain|rinse|reduce|increase|turn|flip)\b/i.test(
      line,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Packet 33 — Extract a servings/yield value from a single line,
 * supporting the prefix ("Serves 4", "Makes 12 cookies", "Yield: 2
 * loaves", "Portions: 6", "For 4 people") and leading-number ("4
 * servings", "6 portions") shapes. Returns null when no pattern
 * matches or when the extracted value is outside a sane range.
 *
 * Range handling: "Serves 4-6" / "Serves 4 to 6" returns the rounded
 * midpoint (5) so the nutrition estimator has a single anchor.
 *
 * Guardrails:
 *   - Cap at 100 servings to reject obvious parse errors (e.g. a
 *     random numeric line mis-matching).
 *   - `for` must be followed by a person-noun (people / persons /
 *     guests / pax) so common cookbook prose like "cook for 4 hours"
 *     does not spoof yield.
 *
 * Exported so tests can exercise the regex+rounding surface
 * directly without reconstructing a full recipe paste.
 */
/**
 * Packet 34 — Is this line dominantly a servings/yield line?
 *
 * Returns true when the whole trimmed line is the servings phrase
 * (plus an optional trailing yield noun). Used by `splitSections`
 * to `continue` past the line so yield metadata never doubles as a
 * title, description preamble, or ingredient row.
 *
 * Mid-line matches ("1 cup milk (serves 4)") intentionally return
 * false — extractServings still captures the number, but the line
 * keeps flowing through normal per-line handling.
 *
 * Exported so tests and downstream helpers can run the same check
 * without re-implementing the regex.
 */
export function isDominantServingsLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  return (
    DOMINANT_SERVINGS_PREFIX_RE.test(trimmed) ||
    DOMINANT_SERVINGS_LEADING_RE.test(trimmed)
  );
}

export function extractServings(line: string): number | null {
  // Packet 34 — Iterate every prefix candidate on the line so a failed
  // `for N hours` guard doesn't swallow a later real `serves N` cue on
  // the same run-on line. Reset lastIndex first in case the regex was
  // previously exec'd mid-stream (RegExp with /g keeps internal state).
  SERVINGS_PREFIX_RE.lastIndex = 0;
  let chosen: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = SERVINGS_PREFIX_RE.exec(line)) !== null) {
    const label = match[0]
      .slice(0, match[0].indexOf(match[1]))
      .toLowerCase();
    const requiresPersonNoun = /\bfor\b/.test(label);
    const personNoun = match[3];
    if (requiresPersonNoun && !personNoun) continue;
    const a = Number(match[1]);
    const b = match[2] != null ? Number(match[2]) : null;
    if (!Number.isFinite(a) || a <= 0 || a > 100) continue;
    if (b != null && Number.isFinite(b) && b > 0 && b <= 100 && b >= a) {
      chosen = Math.round((a + b) / 2);
    } else {
      chosen = a;
    }
  }
  if (chosen !== null) return chosen;
  const leadingMatch = SERVINGS_LEADING_RE.exec(line);
  if (leadingMatch) {
    const n = Number(leadingMatch[1]);
    if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  }
  return null;
}

function splitSections(text: string): ParsedSections {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let title: string | null = null;
  let description: string | null = null;
  let servings: number | null = null;
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];

  let mode: 'header' | 'ingredients' | 'steps' = 'header';
  const preambleLines: string[] = [];

  for (const line of lines) {
    // Packet 33 — Servings detection (can appear anywhere, on any
    // line). Prefer the prefix/label form ("Serves 4", "Makes 12
    // cookies", "For 4 people"); fall back to the leading-number
    // form ("4 servings", "6 portions"). Ranges collapse to the
    // rounded midpoint; the "for N" form only matches when followed
    // by a person-noun so ordinary prose (cook for 4 hours) does not
    // spoof the yield.
    const servingsHit = extractServings(line);
    if (servingsHit !== null) servings = servingsHit;
    // Packet 34 — When the line is dominantly a yield phrase, skip
    // further per-line handling. This prevents servings metadata
    // from polluting title / description / ingredient slots (e.g. a
    // paste where "4 servings" appears before the recipe title was
    // landing "4 servings" as a ghost ingredient row).
    if (servingsHit !== null && isDominantServingsLine(line)) {
      continue;
    }
    if (INGREDIENTS_HEADER_RE.test(line)) {
      mode = 'ingredients';
      continue;
    }
    if (STEPS_HEADER_RE.test(line)) {
      mode = 'steps';
      continue;
    }
    if (mode === 'header') {
      // If we haven't seen an Ingredients header but the line clearly
      // looks like an ingredient (leading quantity), promote into
      // ingredients mode. This handles pastes that lack explicit
      // section headers (the common case from web copy).
      if (title && looksLikeIngredientLine(line)) {
        mode = 'ingredients';
        ingredientLines.push(line);
        continue;
      }
      if (!title) title = line;
      else preambleLines.push(line);
      continue;
    }
    if (mode === 'ingredients') {
      // Auto-transition to steps when a clearly instructional line
      // appears without an explicit "Instructions" header. This stops
      // instruction prose from being treated as an ingredient (which
      // leaked prose into nutrition estimation + NDS scoring).
      if (looksLikeInstructionLine(line) && !looksLikeIngredientLine(line)) {
        mode = 'steps';
        stepLines.push(line);
        continue;
      }
      ingredientLines.push(line);
      continue;
    }
    if (mode === 'steps') {
      stepLines.push(line);
      continue;
    }
  }

  if (preambleLines.length > 0) description = preambleLines.join(' ');
  return { title, description, servings, ingredientLines, stepLines };
}

function inferMealTypeHint(
  title: string | null,
  description: string | null,
  userHint?: string | null,
): ImportedMealTypeHint {
  const hintSource = [userHint, title, description]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join(' ')
    .toLowerCase();
  if (/\b(breakfast|pancake|waffle|oatmeal|granola|smoothie bowl)\b/.test(hintSource)) return 'breakfast';
  if (/\b(lunch|salad|sandwich|wrap|bowl)\b/.test(hintSource)) return 'lunch';
  if (/\b(dinner|roast|stew|braise|pasta|risotto)\b/.test(hintSource)) return 'dinner';
  if (/\b(snack|bar|bite|dip|chips|trail mix)\b/.test(hintSource)) return 'snack';
  return 'unknown';
}

// ============================================================================
// Nutrition estimate (Packet 6: matcher-grounded)
//
// The heuristic guess table used to live inline here. Packet 6 moves it
// (and the trusted food-object lookup layer) into
// `lib/plans/ingredientMatcher.ts` so the same matching logic runs
// across the sync initial-parse path and the async edit-rebuild path.
// This file now only composes matcher results into the public shapes:
// `NutritionEstimate`, `IngredientMatchEntry[]`, attachable
// `PlannedMealPayload`, and meal-level NDS.
// ============================================================================

/**
 * Build a `NutritionEstimate` wrapper around an already-computed matcher
 * result. Packet 6 keeps the estimate and per-ingredient match records
 * coherent: we use the matcher's `estimate_confidence` (which is lifted
 * when more ingredients resolve to trusted food-object matches) and
 * describe the grounding source in the notes.
 */
function buildEstimateFromMatches(
  matched: IngredientsMatchedResult,
  ingredients: ImportedMealDraftIngredient[],
  servings: number | null,
  fallback: boolean,
): NutritionEstimate {
  const trustedPct = Math.round(matched.trusted_ratio * 100);
  const notes = fallback
    ? 'No structured ingredients were detected. Estimate is a coarse fallback; review before using.'
    : matched.trusted_ratio > 0
      ? `Estimate grounded against the trusted food-object corpus for ${trustedPct}% of ingredients; remaining ingredients use the heuristic fallback.`
      : ingredients.length > 0
        ? 'No trusted food-object matches yet. Estimate is derived from the heuristic fallback table — edit or promote ingredients to trusted sources to raise confidence.'
        : 'Heuristic estimate from parsed ingredients. Replace with linked food_objects for higher confidence.';

  return {
    per_serving: matched.per_serving_totals,
    servings,
    confidence: fallback ? 'low' : matched.estimate_confidence,
    source: fallback ? 'unknown' : 'parsed_from_recipe',
    notes,
  };
}

// ============================================================================
// Attachable payload + NDS shape (Packet 6: matcher-grounded)
//
// The attachable payload is now built from the matcher output rather
// than the local heuristic table. Per-ingredient calories/macros come
// from whichever tier resolved the ingredient: trusted food-object
// match (preferred) → heuristic guess → default fallback. The
// `food_object_id` on each attachable item is populated when the
// ingredient resolved to a trusted source, preserving provenance for
// downstream promoters and slot-attach consumers.
//
// IMPORTANT — instruction-separation contract (unchanged):
//   Recipe steps (`parsed_payload_json.steps`) are never copied into
//   `payload.items`. That guarantee is what keeps instructional prose
//   out of templates, planned_meals, and journal entries.
// ============================================================================

// ============================================================================
// Public rebuild helper (Packet 4 follow-up — transparent edits)
// ============================================================================

/**
 * Per-ingredient derivation record — used by the PATCH recompute path
 * and (indirectly) by the draft review UI to make the estimate math
 * legible. Each record explains:
 *
 *   - which guess row matched the ingredient name (or DEFAULT fallback)
 *   - the quantity multiplier applied (unit-aware)
 *   - the per-item calorie / macro contribution post-scaling +
 *     per-serving division
 *
 * This is derived-on-read metadata; the authoritative source remains
 * `imported_meals.parsed_payload_json.ingredients` and the attachable
 * `payload.items`. We do not persist the derivation blob — it can
 * always be recomputed from the structured ingredients.
 */
export interface IngredientDerivation {
  ingredient_index: number;
  matched_rule: string | null;
  multiplier: number;
  per_item_calories: number;
  per_item_protein_g: number;
  per_item_carbs_g: number;
  per_item_fat_g: number;
}

export interface RebuildDerivedResult {
  payload: PlannedMealPayload;
  nutrition_estimate: NutritionEstimate;
  ingredient_match: IngredientMatchEntry[];
  ingredient_derivations: IngredientDerivation[];
  nds: RecipeImportResult['nds'];
  parse_status: ImportedMealParseStatus;
}

function derivationsFromMatched(
  matched: IngredientsMatchedResult,
): IngredientDerivation[] {
  return matched.records.map((rec, i) => {
    const ps = rec.per_serving_estimate;
    return {
      ingredient_index: i,
      matched_rule: rec.source_label,
      multiplier: 1, // legacy field; grounding is now recorded in `rec.explanation`
      per_item_calories: ps.calories ?? 0,
      per_item_protein_g: ps.protein_g ?? 0,
      per_item_carbs_g: ps.carbs_g ?? 0,
      per_item_fat_g: ps.fat_g ?? 0,
    };
  });
}

/**
 * Packet 6 — sync rebuild without trusted lookup. Produces Packet 6
 * IngredientMatchRecord shapes but every record resolves via the
 * heuristic fallback tiers (guessed / none). Kept for pure, fast paths
 * and as the reference behaviour in tests.
 *
 * For the grounded path that queries `food_objects`, use
 * {@link rebuildDerivedFromIngredientsGrounded}.
 */
export function rebuildDerivedFromIngredients(args: {
  title: string;
  ingredients: ImportedMealDraftIngredient[];
  servings: number | null;
}): RebuildDerivedResult {
  const { title, ingredients, servings } = args;
  const hasStructure = ingredients.length > 0;
  const matched = matchIngredientsHeuristicOnly(ingredients, servings);
  const estimate = buildEstimateFromMatches(matched, ingredients, servings, !hasStructure);
  const payload = buildAttachablePayloadFromMatches(title, ingredients, matched);
  const nds = deriveMealNDS(title, payload, estimate.confidence);

  return {
    payload,
    nutrition_estimate: estimate,
    ingredient_match: matched.records,
    ingredient_derivations: derivationsFromMatched(matched),
    nds,
    parse_status: hasStructure ? 'parsed' : 'manual_review',
  };
}

/**
 * Packet 6 — grounded rebuild. Each ingredient is run through the
 * trusted food-object lookup layer before falling back to the heuristic
 * guess table, and the attachable payload / nutrition estimate / match
 * records reflect that grounding.
 *
 * The caller provides the `IngredientLookup`. In Fine Diet production
 * code, pass `createDefaultIngredientLookup()` from
 * `lib/plans/ingredientMatcher`. Unit tests can pass a stubbed lookup.
 */
export async function rebuildDerivedFromIngredientsGrounded(args: {
  title: string;
  ingredients: ImportedMealDraftIngredient[];
  servings: number | null;
  lookup: IngredientLookup;
  /**
   * Packet 28 — per-row user-choice overrides. When a prior match
   * entry carries `user_choice='applied'` with a locked `source_id`,
   * the matcher skips re-scoring that row and grounds nutrition
   * against the chosen food-object directly. When
   * `user_choice='rejected'`, the trusted path is bypassed for that
   * row and it falls through to the heuristic / default layer.
   *
   * Rows without a `priorMatches` entry or without an explicit
   * user_choice re-run through the normal matcher path — this keeps
   * edits to amount/unit/name from stale-pinning unrelated rows.
   */
  priorMatches?: IngredientMatchEntry[] | null;
}): Promise<RebuildDerivedResult> {
  const { title, ingredients, servings, lookup, priorMatches } = args;
  const hasStructure = ingredients.length > 0;
  const matched = await matchIngredients(ingredients, servings, lookup, {
    priorMatches: priorMatches ?? null,
  });
  const estimate = buildEstimateFromMatches(matched, ingredients, servings, !hasStructure);
  const payload = buildAttachablePayloadFromMatches(title, ingredients, matched);
  const nds = deriveMealNDS(title, payload, estimate.confidence);

  return {
    payload,
    nutrition_estimate: estimate,
    ingredient_match: matched.records,
    ingredient_derivations: derivationsFromMatched(matched),
    nds,
    parse_status: hasStructure ? 'parsed' : 'manual_review',
  };
}

interface AttachableTotalsLike {
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

function deriveMealNDS(
  title: string,
  payload: PlannedMealPayload,
  estimateConfidence: NutritionEstimateConfidence,
): RecipeImportResult['nds'] {
  const shape = payload as unknown as AttachableTotalsLike;
  const derived = computeMealDerivedFromPayload({
    name: title,
    calories: shape.totals.calories,
    macros: { protein: shape.totals.protein_g },
    quantity: 1,
  });
  // Food trust and NDS confidence stay distinct: imported items are
  // never linked to curated food_objects, so meal-level NDS confidence
  // is capped at 'low'. The *estimate*'s confidence is carried
  // separately on the NutritionEstimate record.
  const nds_confidence: NDSConfidence =
    estimateConfidence === 'high' ? 'medium' : 'low';
  return {
    protein_score_10: derived.protein_score_10,
    is_main_meal: derived.is_main_meal,
    psq_multiplier: derived.psq_multiplier,
    meal_derived_data: derived,
    nds_confidence,
  };
}

// ============================================================================
// Public entry point
// ============================================================================

export interface RunRecipeImportOptions {
  /** Override source_platform detection (e.g. when caller already knows). */
  source_platform?: string | null;
}

export function runRecipeImport(
  input: RecipeImportInput,
  options: RunRecipeImportOptions = {},
): RecipeImportResult {
  const text = typeof input.text === 'string' ? input.text : null;
  const url = typeof input.url === 'string' ? input.url : null;
  const userHint = typeof input.user_hint === 'string' ? input.user_hint : null;

  const { import_type, source_type } = classifyInput(input);
  const source_platform =
    options.source_platform ??
    input.source_platform ??
    (url ? detectSourcePlatform(url) : null);

  // Video / social URL capture lands in manual_review unless text was
  // also supplied. The raw URL is preserved so the user can finish the
  // work by pasting a transcript or ingredient list later.
  if (import_type === 'video' && (!text || text.trim().length === 0)) {
    const title = url ? `Imported video — ${source_platform ?? 'link'}` : 'Imported video';
    const rebuilt = rebuildDerivedFromIngredients({ title, ingredients: [], servings: null });
    return {
      title,
      import_type,
      source_type,
      source_url: url,
      source_platform,
      raw_input_text: null,
      parse_status: 'manual_review',
      parsed_payload_json: {
        title,
        description: 'Video import captured. Paste the recipe text to finish parsing.',
        servings: null,
        ingredients: [],
        steps: [],
        meal_type_hint: 'unknown',
      },
      nutrition_estimate_json: rebuilt.nutrition_estimate,
      ingredient_match_json: [],
      payload: rebuilt.payload,
      nds: rebuilt.nds,
    };
  }

  // URL with no accompanying text: we don't fetch remote content in the
  // stub. Persist the URL + raw input and land in manual_review so the
  // user can paste the recipe body or a provider-backed importer can
  // complete the parse in a future packet.
  if (import_type === 'url' && (!text || text.trim().length === 0)) {
    const title = url ? `Imported recipe — ${source_platform ?? 'link'}` : 'Imported recipe';
    const rebuilt = rebuildDerivedFromIngredients({ title, ingredients: [], servings: null });
    return {
      title,
      import_type,
      source_type,
      source_url: url,
      source_platform,
      raw_input_text: null,
      parse_status: 'manual_review',
      parsed_payload_json: {
        title,
        description: 'URL captured. Paste the recipe text to finish parsing.',
        servings: null,
        ingredients: [],
        steps: [],
        meal_type_hint: inferMealTypeHint(null, null, userHint),
      },
      nutrition_estimate_json: rebuilt.nutrition_estimate,
      ingredient_match_json: [],
      payload: rebuilt.payload,
      nds: rebuilt.nds,
    };
  }

  // Text path — parse into sections, ingredients, steps.
  const rawInputText = text ?? '';
  const sections = splitSections(rawInputText);
  const ingredients = sections.ingredientLines.map(parseIngredientLine);
  const steps: ImportedMealDraftStep[] = sections.stepLines
    .map((line, i) => ({
      step_number: i + 1,
      instruction: line.replace(/^(?:\d+[\.)])\s+/, '').trim(),
    }))
    .filter((s) => s.instruction.length > 0);

  const title =
    (sections.title ?? '').trim().length > 0
      ? (sections.title as string).trim()
      : 'Imported recipe';

  // If we failed to extract any structure at all, land in manual_review
  // so we never silently downgrade to an untyped blob.
  const parsed_payload: ImportedMealDraftPayload = {
    title,
    description: sections.description,
    servings: sections.servings,
    ingredients,
    steps,
    meal_type_hint: inferMealTypeHint(title, sections.description, userHint),
  };

  // Synchronous rebuild uses the heuristic-only matcher. The async
  // `rebuildDerivedFromIngredientsGrounded` variant is what the API
  // layer calls after persistence to lift confidence using the trusted
  // food-object corpus.
  const rebuilt = rebuildDerivedFromIngredients({
    title,
    ingredients,
    servings: sections.servings,
  });
  const hasStructure = ingredients.length > 0 || steps.length > 0;
  const parse_status: ImportedMealParseStatus = hasStructure
    ? 'parsed'
    : 'manual_review';

  return {
    title,
    import_type,
    source_type,
    source_url: url,
    source_platform,
    raw_input_text: rawInputText.length > 0 ? rawInputText : null,
    parse_status,
    parsed_payload_json: parsed_payload,
    nutrition_estimate_json: rebuilt.nutrition_estimate,
    ingredient_match_json: rebuilt.ingredient_match,
    payload: rebuilt.payload,
    nds: rebuilt.nds,
  };
}
