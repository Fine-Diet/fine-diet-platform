/**
 * Missing-food demand eligibility.
 *
 * Journal search calls `searchFoods` on a 300ms debounce for every keystroke
 * of 2+ characters. `search_abandoned` only fires after a query that already
 * returned results is cleared, so it does not identify a completed zero-result
 * search. There is no final-query signal on the zero-result path.
 *
 * This helper is the conservative substitute. It does not use a single
 * minimum length. A zero-result search may enter the missing-food queue only
 * when the raw input shows completion intent:
 *
 *   - barcode / UPC shape (8–14 digits, spaces and dashes allowed)
 *   - a phrase with whitespace and at least two alphabetic tokens of 3+
 *     characters (a leading quantity such as "1" does not disqualify it)
 *   - a single alphabetic token of 8+ characters that contains a vowel
 *
 * Limitation: a finished single-word miss shorter than 8 characters
 * ("quinoa", "kale") is treated as in-progress typing and is not queued.
 * The client never tells the server that typing stopped. Recipe-import
 * capture does not use this helper.
 */

export type MissingFoodDemandReason =
  | 'barcode'
  | 'completed_phrase'
  | 'completed_single_token'
  | 'partial_typing'
  | 'empty';

export interface MissingFoodDemandDecision {
  eligible: boolean;
  reason: MissingFoodDemandReason;
}

const COMPLETED_SINGLE_TOKEN_MIN = 8;
const PHRASE_TOKEN_MIN = 3;

export function evaluateMissingFoodDemand(raw: string | null | undefined): MissingFoodDemandDecision {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { eligible: false, reason: 'empty' };
  if (isBarcodeShaped(trimmed)) return { eligible: true, reason: 'barcode' };

  const tokens = trimmed.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const substantive = tokens.filter((token) => token.length >= PHRASE_TOKEN_MIN && /[a-z]/.test(token));
  if (substantive.length >= 2 && /\s/.test(trimmed)) {
    return { eligible: true, reason: 'completed_phrase' };
  }

  if (tokens.length === 1) {
    const token = tokens[0];
    if (
      token.length >= COMPLETED_SINGLE_TOKEN_MIN &&
      /[aeiou]/.test(token) &&
      /[a-z]/.test(token) &&
      !/^\d+$/.test(token)
    ) {
      return { eligible: true, reason: 'completed_single_token' };
    }
  }

  return { eligible: false, reason: 'partial_typing' };
}

/**
 * UPC-A, EAN-13, GTIN-14, and the shorter 8-digit forms already accepted by
 * `validateUpcLength`. Leading zeros are preserved; they are not stripped.
 */
export function isBarcodeShaped(raw: string): boolean {
  const compact = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(compact)) return false;
  return compact.length >= 8 && compact.length <= 14;
}
