/**
 * Plans Phase 24 — Ingredient phrase parsing and quantity/unit
 * normalization hardening.
 *
 * This module is the single, isomorphic (server + client) source of
 * truth for turning a free-text ingredient line into structured
 * `ImportedMealDraftIngredient` fields. Prior to Packet 24 the server
 * (`lib/plans/recipeImporter.ts`) and the draft edit UI
 * (`pages/journal/plans/imports/[id].tsx`) each carried their own
 * near-duplicate copy of the parsing rules, which drifted and produced
 * inconsistent behaviour when a user edited an ingredient row.
 *
 * Hardening goals (see Packet 24 §3–§4):
 *   1. Split `amount`, `unit`, `name`, and `preparation note` more
 *      reliably, including phrases that previously collapsed into
 *      the ingredient-name slot (parentheticals, leading "of ", size
 *      adjectives like "large").
 *   2. Recognize whole-item / count-based language (`1 red pepper`,
 *      `2 carrots`, `1 lemon`, `2 eggs`) and keep it count-based —
 *      never silently convert to a volume unit like cups or tbsp.
 *   3. Preserve parse uncertainty explicitly (`parse_confidence`,
 *      `quantity_source`) so the downstream nutrition estimator can
 *      stay honest rather than pretend precision.
 *
 * Non-goals:
 *   - Replacing the Packet 6 trusted matcher / food-object lookup.
 *   - Creating trusted food objects from uncertain phrases.
 *   - Rewriting the fixed NDS model.
 */

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Count-based pseudo-unit used when the source phrase is clearly a
 * whole produce / protein / egg / fruit with no explicit measurement.
 * Downstream code (`ingredientMatcher.scaleGuessByQuantity`) treats
 * `whole` the same as `piece`/`slice`/`each` — multiplier = count.
 * `unitToGrams` returns null for `whole`, which keeps the grounded
 * matcher on quantity-only scaling with lower confidence rather than
 * inventing a gram basis.
 */
export const WHOLE_ITEM_UNIT = 'whole';

export const INGREDIENT_UNITS = [
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tbl',
  'teaspoon', 'teaspoons', 'tsp', 'ts',
  'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml',
  'liter', 'liters', 'l',
  'piece', 'pieces', 'pcs',
  'slice', 'slices',
  'clove', 'cloves',
  'can', 'cans',
  'pinch', 'pinches',
  'dash',
  'bunch', 'bunches',
  'head', 'heads',
  'stick', 'sticks',
  'sprig', 'sprigs',
  'stalk', 'stalks',
  'leaf', 'leaves',
  'scoop', 'scoops',
  'drop', 'drops',
] as const;

const UNIT_ALTERNATION = INGREDIENT_UNITS.map((u) =>
  u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
).join('|');

export const UNIT_RE = new RegExp(`^(?:${UNIT_ALTERNATION})\\.?$`, 'i');

export const CONTAINS_UNIT_RE = new RegExp(`\\b(?:${UNIT_ALTERNATION})\\b`, 'i');

// ---------------------------------------------------------------------------
// Quantity tokens (plain and Unicode vulgar fractions)
// ---------------------------------------------------------------------------

const VULGAR_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

const VULGAR_GLYPH_RE = new RegExp(
  `[${Object.keys(VULGAR_FRACTIONS).join('')}]`,
  'g',
);

/**
 * Replace Unicode vulgar fractions with ASCII equivalents. Compound
 * forms like "1½" are split to "1 1/2" so the standard quantity
 * regex picks them up as a mixed fraction. En-dash/em-dash ranges
 * are normalized to ASCII hyphen-minus so range parsing is uniform.
 */
export function normalizeQuantityGlyphs(s: string): string {
  if (!s) return s;
  // Split compounds first: "1½" -> "1 1/2", "2¾" -> "2 3/4".
  let out = s.replace(
    new RegExp(`(\\d)([${Object.keys(VULGAR_FRACTIONS).join('')}])`, 'g'),
    (_, d: string, g: string) => `${d} ${VULGAR_FRACTIONS[g]}`,
  );
  out = out.replace(VULGAR_GLYPH_RE, (g) => VULGAR_FRACTIONS[g] ?? g);
  out = out.replace(/[–—]/g, '-');
  return out;
}

/**
 * Packet 25 — Split weight/volume unit tokens that are attached
 * directly to a number with no intervening space:
 *
 *   "300g chicken breasts"  -> "300 g chicken breasts"
 *   "200ml milk"            -> "200 ml milk"
 *   "14oz canned tomatoes"  -> "14 oz canned tomatoes"
 *   "1.5kg ground beef"     -> "1.5 kg ground beef"
 *   "1tbsp olive oil"       -> "1 tbsp olive oil"
 *
 * Without this step the downstream tokenizer sees "300g" as a single
 * opaque token, QUANTITY_RE fails to match it, and the entire phrase
 * collapses into the ingredient-name slot — leaking the weight token
 * into the name and forcing the matcher onto a conservative default.
 *
 * We only split on unambiguous units: `g`, `kg`, `mg`, `ml`, `cl`,
 * `l`, `oz`, `lb`, `lbs`, `tbsp`, `tbs`, `tbl`, `tsp`. Single-letter
 * `c` (cup) is intentionally excluded to avoid false positives on
 * everyday words containing digits. A trailing `\b` word boundary
 * keeps matches from eating into real words ("1loaf" stays put;
 * "1lb" at a boundary splits as expected).
 */
const ATTACHED_UNIT_RE =
  /(\d+(?:\.\d+)?|\d+\/\d+)(kg|mg|ml|cl|oz|lbs|lb|tbsp|tbs|tbl|tsp|l|g)\b/gi;

export function splitAttachedUnits(s: string): string {
  if (!s) return s;
  return s.replace(ATTACHED_UNIT_RE, (_, n: string, u: string) => `${n} ${u}`);
}

// Matches "1 1/2", "1/2", "1.5", "2". Kept export for the ingredient
// detection heuristic in recipeImporter.ts.
export const QUANTITY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)$/;

export const LEADING_QUANTITY_RE =
  /^(?:[-*•]\s+)?(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|¼|½|¾|⅓|⅔|⅛|⅜|⅝|⅞)\s+/;

/**
 * Parse a quantity token (plain integer, decimal, fraction, or mixed
 * fraction) into a number. Returns null when the input does not match
 * any recognized quantity shape.
 */
export function parseQuantity(s: string): number | null {
  if (!QUANTITY_RE.test(s)) return null;
  if (s.includes(' ')) {
    const [whole, frac] = s.split(/\s+/);
    const [n, d] = frac.split('/').map(Number);
    if (!n || !d) return Number(whole);
    return Number(whole) + n / d;
  }
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    if (!n || !d) return null;
    return n / d;
  }
  return Number(s);
}

// Matches "8-10" after dash normalization. Returns a numeric midpoint
// so the downstream matcher can scale against a plausible center of
// the user-supplied range, flagged as low-confidence.
const RANGE_RE = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/;

function parseRangeMidpoint(s: string): number | null {
  const m = RANGE_RE.exec(s);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a <= 0 || b <= 0) return null;
  return (a + b) / 2;
}

// ---------------------------------------------------------------------------
// Tokens that should be demoted out of the ingredient name slot
// ---------------------------------------------------------------------------

const SIZE_ADJECTIVES = new Set([
  'large', 'medium', 'small', 'big', 'tiny',
  'jumbo', 'mini',
  'ripe', 'fresh', 'raw',
  'xl',
]);

/**
 * Strip leading size adjectives ("1 large egg" -> name="egg",
 * prepExtra="large"). Only demoted when followed by at least one
 * other word; a phrase whose ONLY noun is a size word stays put.
 */
function splitLeadingSizeAdjective(name: string): {
  name: string;
  extra: string | null;
} {
  const trimmed = name.trim();
  if (!trimmed) return { name: trimmed, extra: null };
  const match = /^(\S+)\s+(\S.*)$/.exec(trimmed);
  if (!match) return { name: trimmed, extra: null };
  const head = match[1].toLowerCase().replace(/[.,]$/, '');
  // Support "extra-large" / "extra large" variants.
  if (head === 'extra') {
    const rest = match[2];
    const m2 = /^(\S+)\s+(\S.*)$/.exec(rest);
    if (m2) {
      const second = m2[1].toLowerCase().replace(/[.,]$/, '');
      if (SIZE_ADJECTIVES.has(second) || second === 'large') {
        return { name: m2[2].trim(), extra: `extra ${second}` };
      }
    }
    return { name: trimmed, extra: null };
  }
  if (SIZE_ADJECTIVES.has(head)) {
    return { name: match[2].trim(), extra: head };
  }
  return { name: trimmed, extra: null };
}

/**
 * Strip a leading "of " (common after explicit volumes:
 * "1 cup of flour" -> rest="flour" rather than "of flour").
 */
function stripLeadingOf(name: string): string {
  return name.replace(/^of\s+/i, '').trim();
}

/**
 * Extract parentheticals from the raw line (e.g. "(14 oz)",
 * "(about 1 cup)", "(14-oz can)") and return the cleaned line plus
 * each captured note. Notes are surfaced on `preparation_note` so
 * the information is preserved but does not pollute the quantity /
 * unit / name slots.
 */
function extractParentheticals(line: string): {
  cleaned: string;
  notes: string[];
} {
  const notes: string[] = [];
  const cleaned = line.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const note = inner.trim();
    if (note.length > 0) notes.push(note);
    return ' ';
  });
  return { cleaned: cleaned.replace(/\s{2,}/g, ' ').trim(), notes };
}

// ---------------------------------------------------------------------------
// Packet 26 — Semantic juice / zest phrase handling
// ---------------------------------------------------------------------------

/**
 * Citrus nouns that we recognize on the right-hand side of a
 * "Juice of ... ", "Zest of ... ", or "Juice and zest of ..."
 * phrase. The set is intentionally narrow: these are the semantic
 * juice phrases we can interpret conservatively with no risk of
 * inventing liquid conversions. Extend only with real fruit whose
 * whole-fruit count is a meaningful unit of measure.
 */
const CITRUS_NOUNS = new Set<string>([
  'lemon', 'lemons',
  'lime', 'limes',
  'orange', 'oranges',
  'grapefruit', 'grapefruits',
]);

/**
 * Attempt to parse a line as a semantic juice / zest phrase:
 *
 *   "Juice of 1/2 lemon"            -> 0.5 whole lemon, prep="juiced"
 *   "juice of 1 lime"               -> 1 whole lime, prep="juiced"
 *   "Zest of 1 orange"              -> 1 whole orange, prep="zested"
 *   "Zest and juice of 2 oranges"   -> 2 whole orange, prep="zest and juiced"
 *   "Juice of a lemon"              -> 1 whole lemon, prep="juiced"
 *
 * Returns null for anything we can't confidently interpret. This is
 * the conservative path specified in Packet 26 §3c: we never force
 * a guessed volume conversion (cups / tbsp / tsp) from a whole-citrus
 * phrase. Instead we keep the whole-item count and let downstream
 * matching use it as an approximation (with medium confidence).
 */
function parseCitrusJuicePhrase(raw: string): ParsedIngredientPhrase | null {
  const original = raw.trim();
  if (!original) return null;

  const stripped = original.replace(/^(?:[-*•]|\d+[.)])\s+/, '');
  const normalized = normalizeQuantityGlyphs(stripped);

  const m =
    /^(juice and zest|zest and juice|juice|zest)\s+(?:of|from)\s+(.+)$/i.exec(
      normalized,
    );
  if (!m) return null;
  const action = m[1].toLowerCase();
  let tail = m[2].trim();
  if (!tail) return null;

  // Drop a leading English article ("juice of a lemon").
  tail = tail.replace(/^(?:a|an|the)\s+/i, '').trim();

  const tailTokens = tail.split(/\s+/).filter((t) => t.length > 0);
  if (tailTokens.length === 0) return null;

  let quantity_value: number | null = null;
  let rest = tail;
  const twoTok = tailTokens.slice(0, 2).join(' ');
  const qTwo = parseQuantity(twoTok);
  const qOne = parseQuantity(tailTokens[0]);
  if (qTwo !== null) {
    quantity_value = qTwo;
    rest = tailTokens.slice(2).join(' ');
  } else if (qOne !== null) {
    quantity_value = qOne;
    rest = tailTokens.slice(1).join(' ');
  } else {
    // "juice of a lemon" / "juice of lemon" — imply one whole fruit.
    quantity_value = 1;
  }

  rest = rest.replace(/^(?:a|an|the)\s+/i, '').trim();
  if (rest.length === 0) return null;

  // Split the first word (the citrus noun) from trailing modifiers
  // so "Juice of 1 large lemon" still recognizes "lemon". Demote any
  // trailing modifiers into the prep note.
  const restTokens = rest.split(/\s+/);
  let citrusToken: string | null = null;
  const trailingParts: string[] = [];
  for (const tok of restTokens) {
    const clean = tok.toLowerCase().replace(/[.,]$/, '');
    if (!citrusToken && CITRUS_NOUNS.has(clean)) {
      citrusToken = clean;
    } else if (citrusToken) {
      trailingParts.push(tok);
    } else {
      // First non-citrus word before we find the noun (e.g. "large")
      // — demote into the prep note so we still recognize the phrase.
      trailingParts.push(tok);
    }
  }
  if (!citrusToken) return null;

  // Normalize citrus noun to its singular form for the name field so
  // downstream matching hits one canonical entry.
  const singular = citrusToken.replace(/s$/, '');

  const base =
    action === 'juice'
      ? 'juiced'
      : action === 'zest'
        ? 'zested'
        : 'zest and juiced';
  const extras = trailingParts
    .map((t) => t.replace(/[.,]$/, '').trim())
    .filter((t) => t.length > 0)
    .join(' ');
  const preparation_note = extras.length > 0 ? `${base}; ${extras}` : base;

  return {
    raw_text: original,
    normalized_name: singular,
    quantity_value,
    quantity_unit: WHOLE_ITEM_UNIT,
    preparation_note,
    // Semantic juice handling is honest-but-fuzzy: a "medium" lemon
    // yields materially different juice than a small one, so we hand
    // the downstream estimator a count-based anchor at medium
    // confidence rather than pretending it's an exact measurement.
    parse_confidence: 'medium',
    quantity_source: 'count_inferred',
  };
}

// ---------------------------------------------------------------------------
// Parse entry point
// ---------------------------------------------------------------------------

export type QuantitySource =
  | 'explicit'
  | 'count_inferred'
  | 'range_midpoint'
  | 'approximated';

export type ParseConfidence = 'high' | 'medium' | 'low';

export interface ParsedIngredientPhrase {
  raw_text: string;
  normalized_name: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  preparation_note: string | null;
  parse_confidence: ParseConfidence;
  quantity_source: QuantitySource | null;
}

/**
 * Parse a single free-text ingredient line into structured fields.
 *
 * Rules (Packet 24 §4a):
 *   - Strip bullets / leading numbering.
 *   - Normalize Unicode vulgar fractions and en/em dashes.
 *   - Extract parenthetical notes into `preparation_note`.
 *   - Parse a leading amount token (integer, decimal, fraction,
 *     mixed fraction, or `N-M` range). Ranges collapse to midpoint
 *     at low confidence.
 *   - Consume a recognized unit token when it follows the amount;
 *     strip a trailing period ("Tbsp.").
 *   - Strip a leading "of " from the remaining text.
 *   - Demote leading size adjectives ("large", "medium", etc.) into
 *     the preparation note instead of leaving them glued to the
 *     ingredient name.
 *   - Whole-item fallback: when a quantity was parsed but no unit
 *     matched, set `quantity_unit = 'whole'` and
 *     `quantity_source = 'count_inferred'`. This preserves intent
 *     without inventing a volume unit like cup / tbsp / tsp.
 *
 * The function is pure and side-effect free — identical inputs
 * always produce identical outputs. It runs on both the Next.js
 * server (import API route) and the draft edit page (client).
 */
export function parseIngredientPhrase(line: string): ParsedIngredientPhrase {
  const raw_text = line.trim();

  // Packet 26 §3c: semantic juice / zest phrases ("Juice of 1/2
  // lemon") parse to a whole-fruit anchor at medium confidence
  // rather than inventing a liquid unit conversion. Runs before the
  // general tokenizer so phrases that otherwise have no leading
  // numeric token still get structured fields.
  const juice = parseCitrusJuicePhrase(raw_text);
  if (juice) return juice;

  // Strip leading bullets / numbering: "- ", "* ", "• ", "1.", "1)".
  let cleaned = raw_text.replace(/^(?:[-*•]|\d+[.)])\s+/, '');
  cleaned = normalizeQuantityGlyphs(cleaned);
  // Packet 25: split inline weighted tokens ("300g" -> "300 g") so
  // the tokenizer can surface the amount and unit into their proper
  // slots instead of leaving the weight glued to the ingredient name.
  cleaned = splitAttachedUnits(cleaned);

  // Pull parentheticals out before tokenization so "1 (14 oz) can
  // tomatoes" doesn't trip the quantity/unit heuristics.
  const paren = extractParentheticals(cleaned);
  cleaned = paren.cleaned;

  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);

  let quantity_value: number | null = null;
  let quantity_unit: string | null = null;
  let quantity_source: QuantitySource | null = null;
  let parse_confidence: ParseConfidence = 'high';
  let rest = cleaned;

  if (tokens.length >= 1) {
    const twoTok = tokens.slice(0, 2).join(' ');
    const oneTok = tokens[0];

    const qTwo = parseQuantity(twoTok);
    const qOne = parseQuantity(oneTok);
    const rangeOne = parseRangeMidpoint(oneTok);

    if (qTwo !== null) {
      quantity_value = qTwo;
      quantity_source = 'explicit';
      rest = tokens.slice(2).join(' ');
    } else if (qOne !== null) {
      quantity_value = qOne;
      quantity_source = 'explicit';
      rest = tokens.slice(1).join(' ');
    } else if (rangeOne !== null) {
      quantity_value = rangeOne;
      quantity_source = 'range_midpoint';
      parse_confidence = 'low';
      rest = tokens.slice(1).join(' ');
    }

    if (quantity_value !== null) {
      const unitCandidate = (rest.split(/\s+/)[0] ?? '').replace(/[.,]$/, '');
      if (UNIT_RE.test(unitCandidate)) {
        quantity_unit = unitCandidate.toLowerCase();
        rest = rest.split(/\s+/).slice(1).join(' ');
      }
    }
  }

  // Remove "of " lead-in after explicit unit stripping.
  rest = stripLeadingOf(rest);

  // Pull a preparation note from a trailing comma phrase:
  //   "onion, finely diced" -> name="onion" prep="finely diced".
  let normalized_name: string | null = rest.trim() || null;
  let preparation_note: string | null = null;
  if (normalized_name && normalized_name.includes(',')) {
    const [nm, ...noteParts] = normalized_name.split(',');
    normalized_name = nm.trim() || null;
    const trailing = noteParts.join(',').trim();
    if (trailing.length > 0) preparation_note = trailing;
  }

  // Demote a leading size adjective into the prep note so name =
  // bare ingredient label ("1 large egg" -> name="egg" prep="large").
  if (normalized_name) {
    const { name: stripped, extra } = splitLeadingSizeAdjective(normalized_name);
    if (extra) {
      normalized_name = stripped || null;
      preparation_note = preparation_note
        ? `${preparation_note}; ${extra}`
        : extra;
    }
  }

  // Fold parenthetical notes into the preparation note.
  if (paren.notes.length > 0) {
    const joined = paren.notes.join('; ');
    preparation_note = preparation_note
      ? `${preparation_note}; ${joined}`
      : joined;
  }

  // Whole-item / count-inferred fallback. We require a *cleaned name*
  // so "1" on its own (nonsense) does not get stamped with the
  // whole-item unit.
  if (
    quantity_value !== null &&
    quantity_unit === null &&
    quantity_source === 'explicit' &&
    normalized_name !== null
  ) {
    quantity_unit = WHOLE_ITEM_UNIT;
    quantity_source = 'count_inferred';
    // Count-inferred is honest-but-fuzzy: size of "1 red pepper"
    // varies enough that we should not claim high confidence on the
    // nutrition estimate that follows.
    if (parse_confidence === 'high') parse_confidence = 'medium';
  }

  if (normalized_name !== null) {
    normalized_name = normalized_name
      .replace(/\s{2,}/g, ' ')
      .replace(/^[-,;\s]+|[-,;\s]+$/g, '')
      .trim();
    if (normalized_name.length === 0) normalized_name = null;
  }

  return {
    raw_text,
    normalized_name,
    quantity_value,
    quantity_unit,
    preparation_note,
    parse_confidence,
    quantity_source,
  };
}

/**
 * Rebuild a canonical `raw_text` from structured fields. Used by the
 * draft edit UI so the authoritative free-text slot stays in sync
 * after per-field edits (amount, unit, name, prep note). Keeps the
 * whole-item pseudo-unit hidden from the user — "1 whole apple" is
 * rendered as "1 apple".
 */
export function rebuildRawTextFromStructured(ing: {
  quantity_value: number | null;
  quantity_unit: string | null;
  normalized_name: string | null;
  preparation_note: string | null;
}): string {
  const parts: string[] = [];
  if (ing.quantity_value !== null) {
    const q = Number.isInteger(ing.quantity_value)
      ? String(ing.quantity_value)
      : String(ing.quantity_value);
    parts.push(q);
  }
  if (ing.quantity_unit && ing.quantity_unit !== WHOLE_ITEM_UNIT) {
    parts.push(ing.quantity_unit);
  }
  if (ing.normalized_name) parts.push(ing.normalized_name);
  const base = parts.join(' ').trim();
  return ing.preparation_note ? `${base}, ${ing.preparation_note}` : base;
}
