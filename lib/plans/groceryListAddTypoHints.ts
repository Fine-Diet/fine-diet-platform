/**
 * Typo / “Did you mean” hints for search-first grocery Add Item.
 * Client-safe. Never silently replaces the typed phrase.
 */

/** High-confidence grocery misspellings → suggested correction token. */
const COMMON_GROCERY_TYPOS: Record<string, string> = {
  brest: 'breast',
  chiken: 'chicken',
  chickn: 'chicken',
  brocoli: 'broccoli',
  brocolli: 'broccoli',
  avacado: 'avocado',
  avacados: 'avocados',
  tomatos: 'tomatoes',
  potatoe: 'potato',
  potatos: 'potatoes',
  resturant: 'restaurant',
  yougurt: 'yogurt',
  youghurt: 'yogurt',
  spinnach: 'spinach',
  blueberies: 'blueberries',
  blueberrys: 'blueberries',
  strawberies: 'strawberries',
  rasberies: 'raspberries',
  rasberries: 'raspberries',
  bananna: 'banana',
  banannas: 'bananas',
  omlette: 'omelette',
  omlet: 'omelette',
  quarinoa: 'quinoa',
  quinua: 'quinoa',
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    let prev = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const cur = row[j + 1];
      const cost = a[i] === b[j] ? 0 : 1;
      row[j + 1] = Math.min(row[j + 1] + 1, row[j] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * Suggest a corrected search phrase. Returns null when no confident hint.
 * Does not mutate the raw entry — callers show “Did you mean …?” only.
 */
export function suggestGroceryAddCorrection(rawOrName: string): string | null {
  const trimmed = rawOrName.trim();
  if (trimmed.length < 3) return null;

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  let changed = false;
  const correctedTokens = tokens.map((token) => {
    const direct = COMMON_GROCERY_TYPOS[token];
    if (direct) {
      changed = true;
      return direct;
    }
    // Near-miss against known corrections (e.g. "brst" ≈ "brest")
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [typo, fix] of Object.entries(COMMON_GROCERY_TYPOS)) {
      const d = levenshtein(token, typo);
      if (d > 0 && d <= 1 && d < bestDist) {
        best = fix;
        bestDist = d;
      }
    }
    if (best) {
      changed = true;
      return best;
    }
    return token;
  });

  if (!changed) return null;
  const suggestion = correctedTokens.join(' ');
  if (suggestion === trimmed.toLowerCase()) return null;
  return suggestion;
}

/**
 * Mark whether a catalog label is a likely correction of the typed intent.
 */
export function isLikelyTypoCorrection(options: {
  intentName: string;
  label: string;
  correctionHint?: string | null;
}): boolean {
  const intent = options.intentName.trim().toLowerCase();
  const label = options.label.trim().toLowerCase();
  if (!intent || intent.length < 3) return false;
  if (label === intent || label.includes(intent)) return false;

  const hint = options.correctionHint?.trim().toLowerCase() ?? null;
  if (hint && (label.includes(hint) || hint.split(/\s+/).every((t) => label.includes(t)))) {
    return true;
  }

  // Token-level edit distance against the last intent token (e.g. brest → breast)
  const intentTokens = intent.split(/\s+/);
  const last = intentTokens[intentTokens.length - 1] ?? '';
  if (last.length < 4) return false;
  const labelTokens = label.split(/[\s—,-]+/).filter((t) => t.length >= 4);
  return labelTokens.some((token) => {
    const d = levenshtein(last, token);
    return d > 0 && d <= Math.max(1, Math.floor(last.length / 4));
  });
}
