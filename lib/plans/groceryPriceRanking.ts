/**
 * Deterministic mechanical ranking for grocery price candidates.
 */

import type { GroceryPriceSearchContext } from './groceryPriceProviderTypes';
import type { GroceryPriceProviderCandidate } from './groceryPriceProviderTypes';
import { isEquivalentBrandRetailer } from './groceryPriceSearchQuery';

const SPONSORED_PENALTY = 0.12;
const WRONG_VARIANT_PENALTY = 0.2;
const MULTIPACK_PENALTY = 0.15;
const RETAILER_MISMATCH_PENALTY = 0.25;

const PRODUCT_TOKEN_STOP_WORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'from',
  'free',
  'fresh',
  'organic',
  'natural',
  'market',
  'foods',
  'whole',
]);

function tokenize(value: string | null | undefined): string[] {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function extractProductDefiningTokens(context: GroceryPriceSearchContext): string[] {
  const sources = [
    context.canonical_name,
    context.preferred_product,
    context.required_ingredient_name,
  ].filter(Boolean) as string[];

  const excluded = new Set<string>([
    ...tokenize(context.brand_name),
    ...tokenize(context.retailer),
    ...Array.from(PRODUCT_TOKEN_STOP_WORDS),
  ]);

  const tokens = new Set<string>();
  for (const source of sources) {
    for (const token of tokenize(source)) {
      if (token.length < 3 || excluded.has(token)) continue;
      tokens.add(token);
    }
  }
  return Array.from(tokens);
}

function titleIncludesProductToken(title: string, token: string): boolean {
  const lower = title.toLowerCase();
  if (lower.includes(token)) return true;
  if (token.endsWith('s') && lower.includes(token.slice(0, -1))) return true;
  if (lower.includes(`${token}s`)) return true;
  return false;
}

export function hasMeaningfulProductTokenOverlap(
  context: GroceryPriceSearchContext,
  title: string,
): boolean {
  const productTokens = extractProductDefiningTokens(context);
  if (productTokens.length === 0) {
    const ingredientTokens = tokenize(context.required_ingredient_name).filter(
      (token) => token.length >= 3 && !PRODUCT_TOKEN_STOP_WORDS.has(token),
    );
    if (ingredientTokens.length === 0) return true;
    return ingredientTokens.some((token) => titleIncludesProductToken(title, token));
  }
  return productTokens.some((token) => titleIncludesProductToken(title, token));
}

export function filterRelevantGroceryPriceCandidates(
  context: GroceryPriceSearchContext,
  candidates: GroceryPriceProviderCandidate[],
): GroceryPriceProviderCandidate[] {
  return candidates.filter((candidate) =>
    hasMeaningfulProductTokenOverlap(context, candidate.title),
  );
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of Array.from(setA)) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...Array.from(setA), ...Array.from(setB)]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeUpc(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function retailerMatches(requested: string, candidateRetailer: string): boolean {
  const a = requested.trim().toLowerCase();
  const b = candidateRetailer.trim().toLowerCase();
  return a === b || b.includes(a) || a.includes(b);
}

function hasPenaltyToken(title: string, tokens: string[]): boolean {
  const lower = title.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

export function rankGroceryPriceCandidates(
  context: GroceryPriceSearchContext,
  candidates: GroceryPriceProviderCandidate[],
): GroceryPriceProviderCandidate[] {
  const relevantCandidates = filterRelevantGroceryPriceCandidates(context, candidates);
  const canonicalTokens = tokenize(
    [context.brand_name, context.canonical_name].filter(Boolean).join(' '),
  );
  const preferredTokens = tokenize(context.preferred_product);
  const ingredientTokens = tokenize(context.required_ingredient_name);
  const requestedUpc = normalizeUpc(context.upc);

  const ranked = relevantCandidates.map((candidate, index) => {
    const reasons: string[] = [];
    let score = 0;

    const candidateUpc = normalizeUpc(candidate.upc);
    if (requestedUpc && candidateUpc && requestedUpc === candidateUpc) {
      score += 0.45;
      reasons.push('exact_upc_match');
    }

    if (retailerMatches(context.retailer, candidate.retailer)) {
      score += 0.18;
      reasons.push('retailer_match');
    } else {
      score -= RETAILER_MISMATCH_PENALTY;
      reasons.push('retailer_mismatch_penalty');
    }

    if (
      context.brand_name
      && candidate.title.toLowerCase().includes(context.brand_name.toLowerCase())
      && !isEquivalentBrandRetailer(context.brand_name, context.retailer)
    ) {
      score += 0.12;
      reasons.push('brand_match');
    }

    const titleTokens = tokenize(candidate.title);
    const canonicalSimilarity = jaccard(canonicalTokens, titleTokens);
    if (canonicalSimilarity > 0) {
      score += canonicalSimilarity * 0.2;
      reasons.push('canonical_title_token_match');
    }

    if (preferredTokens.length > 0) {
      const preferredSimilarity = jaccard(preferredTokens, titleTokens);
      if (preferredSimilarity > 0) {
        score += preferredSimilarity * 0.15;
        reasons.push('preferred_product_match');
      }
    } else if (ingredientTokens.length > 0) {
      const ingredientSimilarity = jaccard(ingredientTokens, titleTokens);
      if (ingredientSimilarity > 0) {
        score += ingredientSimilarity * 0.08;
        reasons.push('ingredient_fallback_match');
      }
    }

    if (
      context.purchase_unit &&
      candidate.package_text &&
      candidate.package_text.toLowerCase().includes(context.purchase_unit.toLowerCase())
    ) {
      score += 0.08;
      reasons.push('package_unit_match');
    }

    if (candidate.is_local) {
      score += 0.05;
      reasons.push('local_signal');
    }

    const titleSimilarity = jaccard(
      canonicalTokens.length > 0 ? canonicalTokens : ingredientTokens,
      titleTokens,
    );
    score += titleSimilarity * 0.1;
    if (titleSimilarity > 0) reasons.push('title_similarity');

    if (hasPenaltyToken(candidate.title, ['sponsored', 'ad'])) {
      score -= SPONSORED_PENALTY;
      reasons.push('sponsored_penalty');
    }
    if (hasPenaltyToken(candidate.title, ['variety pack', 'assorted', 'sampler'])) {
      score -= WRONG_VARIANT_PENALTY;
      reasons.push('wrong_variant_penalty');
    }
    if (hasPenaltyToken(candidate.title, ['multipack', 'multi pack', 'pack of'])) {
      score -= MULTIPACK_PENALTY;
      reasons.push('multipack_penalty');
    }

    const bounded = Math.max(0, Math.min(1, score));
    return {
      ...candidate,
      source_rank: index,
      match_score: bounded,
      match_reasons: reasons,
    };
  });

  return ranked.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    if (a.price !== b.price) return a.price - b.price;
    return a.source_rank - b.source_rank;
  });
}

export function toSearchOffer(candidate: GroceryPriceProviderCandidate) {
  return {
    provider: candidate.provider,
    provider_result_id: candidate.provider_result_id,
    title: candidate.title,
    retailer: candidate.retailer,
    price: candidate.price,
    currency: candidate.currency,
    package_size:
      candidate.package_size != null && candidate.package_unit
        ? candidate.package_size
        : null,
    package_unit:
      candidate.package_size != null && candidate.package_unit
        ? candidate.package_unit
        : null,
    product_url: candidate.product_url,
    image_url: candidate.image_url,
    location_label: candidate.is_local ? 'In store' : null,
    match_confidence: candidate.match_score,
    match_reasons: candidate.match_reasons,
  };
}
