/**
 * Preparation-aware food query interpretation.
 *
 * Deterministic and platform-neutral: no page-local expressions, no model
 * call, and no catalog lookup. Cooking method stays separate from food
 * identity, storage/form words, additions, and exclusions.
 *
 * When the split is not reliable, callers keep the existing search path.
 */

import type {
  FoodPreparationMatch,
  ParsedFoodQuantity,
  PreparationMatchStatus,
  PreparationMethod,
} from './types';
import { findMeasure, normalizeUnit } from '../units/convert';

export type PreparationRetrieval = 'unchanged' | 'identity';

export interface FoodQueryInterpretation {
  original: string;
  normalized: string;
  reliable: boolean;
  ambiguous: boolean;
  retrieval: PreparationRetrieval;
  identityText: string;
  identityTokens: string[];
  requestedMethods: PreparationMethod[];
  formDescriptors: string[];
  additions: string[];
  exclusions: string[];
  quantity: ParsedFoodQuantity | null;
  /** Tokens that are not the food identity. Used to demote brand flags. */
  nonIdentityTokens: string[];
}

const METHOD_VARIANTS: Record<PreparationMethod, readonly string[]> = {
  raw: ['raw'],
  steamed: ['steamed', 'steaming', 'steam'],
  roasted: ['roasted', 'roasting', 'roast'],
  boiled: ['boiled', 'boiling', 'boil'],
  baked: ['baked', 'baking', 'bake'],
  grilled: ['grilled', 'grilling', 'grill'],
  sauteed: ['sauteed', 'sauteing', 'saute'],
  fried: ['fried', 'frying', 'fry'],
};

const VARIANT_TO_METHOD = new Map<string, PreparationMethod>();
for (const method of Object.keys(METHOD_VARIANTS) as PreparationMethod[]) {
  for (const variant of METHOD_VARIANTS[method]) {
    VARIANT_TO_METHOD.set(variant, method);
  }
}

/** Storage and cut words. They are not cooking methods and are not contradictions. */
const FORM_DESCRIPTORS = new Set([
  'frozen',
  'fresh',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'shredded',
  'grated',
  'whole',
  'mashed',
  'peeled',
  'dried',
  'canned',
  'organic',
]);

const FUNCTION_WORDS = new Set([
  'with',
  'without',
  'not',
  'no',
  'and',
  'or',
  'of',
  'the',
  'a',
  'an',
  'in',
  'on',
  'to',
]);

const ADDITION_WORDS = new Set([
  'oil',
  'olive',
  'butter',
  'sauce',
  'salt',
  'margarine',
  'ghee',
  'extra',
  'virgin',
]);

/**
 * Whole dish or product names. A method-shaped word inside one of these
 * stays part of the identity. This is not a food-specific typo list.
 */
const PROTECTED_PHRASES: readonly (readonly string[])[] = [
  ['chicken', 'fried', 'rice'],
  ['fried', 'rice'],
  ['raw', 'sugar'],
  ['peanut', 'butter'],
];

const QUANTITY_UNIT =
  'cups?|tablespoons?|teaspoons?|tbsp|tsp|ounces?|oz|grams?|g|servings?|pieces?|slices?';
const QUANTITY_NUMBER = '\\d+(?:\\.\\d+)?|\\d+\\s*/\\s*\\d+';

const GENERIC_COOKED = 'cooked';
const LISTED_INGREDIENTS = new Set(['oil', 'butter', 'sauce']);

export function preparationAcceptanceRank(status: PreparationMatchStatus): number {
  switch (status) {
    case 'exact_preparation':
      return 4;
    case 'approximate_preparation':
      return 3;
    case 'unspecified_preparation':
      return 2;
    case 'conflicting_preparation':
      return 1;
  }
}

export function preparationRankBoost(status: PreparationMatchStatus): number {
  switch (status) {
    case 'exact_preparation':
      return 480;
    case 'approximate_preparation':
      return 40;
    case 'unspecified_preparation':
      return 0;
    case 'conflicting_preparation':
      return -120;
  }
}

export function interpretFoodQuery(raw: string): FoodQueryInterpretation {
  const original = raw ?? '';
  const leading = parseLeadingQuantity(original);
  const rest = leading ? original.slice(leading.consumed).trim() : original;
  const folded = foldText(rest);
  const quantity = leading?.valid
    ? { amount: leading.amount, unit: leading.unit, consumed: leading.consumed }
    : null;
  const remainder = folded;
  const tokens = remainder.split(' ').filter((token) => token.length >= 2);
  const protectedIndexes = protectedTokenIndexes(tokens);

  const consumed = new Set<number>();
  const additions: string[] = [];
  const exclusions: string[] = [];
  let ambiguous = false;

  for (let i = 0; i < tokens.length; i += 1) {
    if (consumed.has(i) || protectedIndexes.has(i)) continue;
    const cue = tokens[i];
    if (cue !== 'with' && cue !== 'without' && cue !== 'not' && cue !== 'no') continue;
    const phrase = collectConstraintPhrase(tokens, i + 1, protectedIndexes);
    if (phrase.words.length === 0) {
      ambiguous = true;
      continue;
    }
    for (const index of phrase.indexes) consumed.add(index);
    consumed.add(i);
    const text = phrase.words.join(' ');
    if (cue === 'with') additions.push(text);
    else exclusions.push(text);
  }

  const requested = new Set<PreparationMethod>();
  const forms: string[] = [];
  const identity: string[] = [];
  const nonIdentity: string[] = [];

  tokens.forEach((token, index) => {
    if (consumed.has(index)) {
      nonIdentity.push(token);
      return;
    }
    if (protectedIndexes.has(index)) {
      identity.push(token);
      return;
    }
    const method = VARIANT_TO_METHOD.get(token);
    if (method) {
      requested.add(method);
      nonIdentity.push(token);
      return;
    }
    if (FORM_DESCRIPTORS.has(token) || token === GENERIC_COOKED) {
      forms.push(token === GENERIC_COOKED ? GENERIC_COOKED : token);
      nonIdentity.push(token);
      return;
    }
    if (FUNCTION_WORDS.has(token)) {
      nonIdentity.push(token);
      return;
    }
    identity.push(token);
  });

  const requestedMethods = (Object.keys(METHOD_VARIANTS) as PreparationMethod[])
    .filter((method) => requested.has(method));

  if (requestedMethods.length > 1) ambiguous = true;
  if (
    (requestedMethods.length > 0 || additions.length > 0 || exclusions.length > 0) &&
    identity.length === 0
  ) {
    ambiguous = true;
  }

  const hasConstraint =
    requestedMethods.length > 0 || additions.length > 0 || exclusions.length > 0;
  const reliable = hasConstraint && !ambiguous && identity.length > 0;
  const retrieval: PreparationRetrieval = reliable ? 'identity' : 'unchanged';

  return {
    original,
    normalized: folded,
    reliable,
    ambiguous,
    retrieval,
    identityText: identity.join(' '),
    identityTokens: identity,
    requestedMethods: reliable ? requestedMethods : [],
    formDescriptors: forms,
    additions: reliable ? additions : [],
    exclusions: reliable ? exclusions : [],
    quantity: quantity
      ? { amount: quantity.amount, unit: quantity.unit }
      : null,
    nonIdentityTokens: nonIdentity,
  };
}

export function demoteNonIdentityBrandFlags<T extends { canonical: string; isBrandLike: boolean }>(
  groups: T[],
  interpretation: FoodQueryInterpretation,
): T[] {
  if (interpretation.retrieval !== 'identity') return groups;
  const identity = new Set(interpretation.identityTokens);
  return groups.map((group) =>
    identity.has(group.canonical) ? group : { ...group, isBrandLike: false },
  );
}

export function qualifyFoodPreparation(
  canonicalName: string,
  interpretation: FoodQueryInterpretation,
  measures?: Array<{ unit: string; grams: number; label?: string }> | null,
  servingSizeG?: number | null,
): FoodPreparationMatch | null {
  if (interpretation.retrieval !== 'identity') return null;

  const listed = readListedPreparation(canonicalName);
  const requested = interpretation.requestedMethods;
  const requestedSet = new Set(requested);
  // A listed method is a conflict only when the query asked for a method.
  const differentMethod =
    requested.length > 0 && listed.methods.some((method) => !requestedSet.has(method));
  const requestedMethodAbsent = requested.some((method) => listed.absentMethods.includes(method));
  const allRequestedPresent =
    requested.length > 0 && requested.every((method) => listed.methods.includes(method));
  const exclusionConflict = interpretation.exclusions.some(
    (exclusion) => constraintState(listed, exclusion) === 'present',
  );
  const additionConflict = interpretation.additions.some(
    (addition) => constraintState(listed, addition) === 'absent',
  );

  let status: PreparationMatchStatus;
  if (requestedMethodAbsent || differentMethod || exclusionConflict || additionConflict) {
    status = 'conflicting_preparation';
  } else if (requested.length > 0 && allRequestedPresent) {
    status = 'exact_preparation';
  } else if (requested.length > 0 && listed.genericCooked) {
    status = 'approximate_preparation';
  } else {
    status = 'unspecified_preparation';
  }

  const quantitySupported = measureSupported(interpretation.quantity, measures, servingSizeG);
  const match: FoodPreparationMatch = {
    status,
    requestedMethods: requested,
    listedMethods: listed.methods,
    listedLabel: listedLabelFor(listed, status),
    additions: interpretation.additions,
    exclusions: interpretation.exclusions,
    quantity: interpretation.quantity
      ? { amount: interpretation.quantity.amount, unit: interpretation.quantity.unit }
      : null,
    quantitySupported: interpretation.quantity ? quantitySupported : null,
    note: null,
  };
  match.note = formatPreparationMatchNote(match, listed);
  return match;
}

export function formatPreparationMatchNote(
  match: FoodPreparationMatch | null | undefined,
  listed?: ListedPreparation,
): string | null {
  if (!match) return null;
  const requested = requestedPhrase(match);
  const parts: string[] = [];
  const unstated = listed
    ? match.exclusions.filter((exclusion) => constraintState(listed, exclusion) === 'unknown')
    : match.exclusions;
  const unknownAdditions = listed
    ? match.additions.filter((addition) => constraintState(listed, addition) === 'unknown')
    : match.additions;
  const statedAdditions = listed
    ? match.additions.filter((addition) => constraintState(listed, addition) === 'present')
    : [];
  const unconfirmed = [
    ...unknownAdditions.map((addition) => `${capitalize(addition)} is not stated on this record.`),
    ...unstated.map((exclusion) => `${capitalize(exclusion)} is not stated on this record.`),
  ];

  if (match.status === 'exact_preparation') {
    if (unconfirmed.length > 0) {
      parts.push(
        `Requested: ${requested}. Listed as: ${match.listedMethods.join(', ') || match.listedLabel}. ${unconfirmed.join(' ')}`,
      );
    } else if (statedAdditions.length > 0) {
      parts.push(`Requested: ${requested}. Listed as: ${match.listedLabel}. Amount not specified.`);
    }
  } else if (
    match.status === 'conflicting_preparation' &&
    match.requestedMethods.length === 0 &&
    match.additions.length === 0 &&
    match.exclusions.length > 0
  ) {
    parts.push(`Without ${match.exclusions.join(', ')}. Listed as: ${match.listedLabel}.`);
  } else if (match.requestedMethods.length > 0 || match.additions.length > 0 || match.exclusions.length > 0) {
    parts.push(`Requested: ${requested}. Listed as: ${match.listedLabel}.`);
    if (statedAdditions.length > 0 && match.status !== 'conflicting_preparation') {
      parts.push('Amount not specified.');
    }
  }

  if (match.quantity && match.quantitySupported === false) {
    parts.push(
      `Requested amount: ${formatQuantity(match.quantity)}. No ${match.quantity.unit} measure on this record.`,
    );
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

interface ListedPreparation {
  methods: PreparationMethod[];
  absentMethods: PreparationMethod[];
  genericCooked: boolean;
  ingredients: Record<string, 'present' | 'absent'>;
  detail: string | null;
}

function readListedPreparation(name: string): ListedPreparation {
  const folded = foldText(name);
  const tokens = folded.split(' ').filter(Boolean);
  const protectedIndexes = protectedTokenIndexes(tokens);
  const methods: PreparationMethod[] = [];
  const absentMethods: PreparationMethod[] = [];
  const seen = new Set<PreparationMethod>();
  const absentSeen = new Set<PreparationMethod>();
  const ingredients: Record<string, 'present' | 'absent'> = {};
  let genericCooked = false;
  let detail: string | null = null;

  const setIngredient = (ingredient: string, state: 'present' | 'absent') => {
    const current = ingredients[ingredient];
    if (current === 'absent' && state === 'present') return;
    ingredients[ingredient] = state;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    if (protectedIndexes.has(index)) continue;
    const token = tokens[index];
    if (token === 'not' || token === 'no' || token === 'without' || token === 'with') {
      const target = readConstraintTarget(tokens, index + 1, protectedIndexes);
      if (!target) continue;
      const polarity = token === 'with' ? 'present' : 'absent';
      for (const method of target.methods) {
        if (polarity === 'absent') {
          if (absentSeen.has(method)) continue;
          absentSeen.add(method);
          absentMethods.push(method);
          continue;
        }
        if (seen.has(method) || absentSeen.has(method)) continue;
        seen.add(method);
        methods.push(method);
      }
      for (const ingredient of target.ingredients) setIngredient(ingredient, polarity);
      if (target.ingredients.length > 0) {
        const clause = `${polarity === 'present' ? 'with' : 'without'} ${target.phrase}`;
        detail = detail ? `${detail}; ${clause}` : clause;
      }
      index += target.consumed;
      continue;
    }
    if (LISTED_INGREDIENTS.has(token) && tokens[index + 1] === 'free' && !protectedIndexes.has(index + 1)) {
      setIngredient(token, 'absent');
      detail = detail ?? `${token} free`;
      index += 1;
      continue;
    }
    const method = VARIANT_TO_METHOD.get(token);
    if (method && !seen.has(method) && !absentSeen.has(method)) {
      seen.add(method);
      methods.push(method);
    }
    if (token === GENERIC_COOKED) genericCooked = true;
    if (LISTED_INGREDIENTS.has(token)) setIngredient(token, 'present');
  }

  return { methods, absentMethods, genericCooked, ingredients, detail };
}

function readConstraintTarget(
  tokens: string[],
  start: number,
  protectedIndexes: Set<number>,
): { methods: PreparationMethod[]; ingredients: string[]; phrase: string; consumed: number } | null {
  if (start >= tokens.length || protectedIndexes.has(start)) return null;
  const methods: PreparationMethod[] = [];
  const ingredients: string[] = [];
  const phrase: string[] = [];
  let cursor = start;

  const take = (): boolean => {
    if (cursor >= tokens.length || protectedIndexes.has(cursor)) return false;
    if (tokens[cursor] === 'olive' && tokens[cursor + 1] === 'oil' && !protectedIndexes.has(cursor + 1)) {
      if (!ingredients.includes('oil')) ingredients.push('oil');
      phrase.push('olive oil');
      cursor += 2;
      return true;
    }
    const token = tokens[cursor];
    const method = VARIANT_TO_METHOD.get(token) ?? null;
    const ingredient = LISTED_INGREDIENTS.has(token) ? token : null;
    if (!method && !ingredient) return false;
    if (method && !methods.includes(method)) methods.push(method);
    if (ingredient && !ingredients.includes(ingredient)) ingredients.push(ingredient);
    phrase.push(token);
    cursor += 1;
    return true;
  };

  if (!take()) return null;
  while (cursor < tokens.length && (tokens[cursor] === 'and' || tokens[cursor] === 'or')) {
    const joiner = tokens[cursor];
    const next = tokens[cursor + 1];
    if (
      !next ||
      next === 'with' ||
      next === 'without' ||
      next === 'not' ||
      next === 'no' ||
      protectedIndexes.has(cursor)
    ) {
      break;
    }
    const before = cursor;
    cursor += 1;
    if (!take()) {
      cursor = before;
      break;
    }
    phrase.splice(phrase.length - 1, 0, joiner);
  }

  return { methods, ingredients, phrase: phrase.join(' '), consumed: cursor - start };
}

function constraintState(listed: ListedPreparation, phrase: string): 'present' | 'absent' | 'unknown' {
  const targets = phrase
    .split(' ')
    .filter((word) => word !== 'and' && word !== 'olive' && word !== 'extra' && word !== 'virgin');
  const states = targets.map((target) => {
    const method = VARIANT_TO_METHOD.get(target);
    if (method) {
      if (listed.methods.includes(method)) return 'present' as const;
      if (listed.absentMethods.includes(method)) return 'absent' as const;
      return 'unknown' as const;
    }
    if (LISTED_INGREDIENTS.has(target)) return listed.ingredients[target] ?? 'unknown';
    return 'unknown' as const;
  });
  if (states.length === 0) return 'unknown';
  if (states.some((state) => state === 'present')) return 'present';
  if (states.every((state) => state === 'absent')) return 'absent';
  return 'unknown';
}

function describeListed(listed: ListedPreparation): string {
  const parts: string[] = [...listed.methods];
  if (listed.genericCooked && listed.methods.length === 0) parts.push('cooked');
  if (listed.detail && (listed.detail.startsWith('with ') || listed.detail.startsWith('without '))) {
    parts.push(listed.detail);
  }
  for (const method of listed.absentMethods) parts.push(`not ${method}`);
  for (const ingredient of Object.keys(listed.ingredients)) {
    const state = listed.ingredients[ingredient];
    const already = parts.some((part) => part.includes(ingredient));
    if (already) continue;
    parts.push(state === 'absent' ? `without ${ingredient}` : `with ${ingredient}`);
  }
  return parts.join(', ');
}

function listedLabelFor(listed: ListedPreparation, status: PreparationMatchStatus): string {
  const described = describeListed(listed);
  const hasIngredientFact = Object.keys(listed.ingredients).length > 0 || listed.absentMethods.length > 0 || Boolean(listed.detail);
  if (status === 'approximate_preparation' && !hasIngredientFact) return 'cooked, preparation unspecified';
  if (described) return described;
  return 'preparation unspecified';
}

function requestedPhrase(match: FoodPreparationMatch): string {
  const parts: string[] = [...match.requestedMethods];
  if (match.additions.length > 0) parts.push(`with ${match.additions.join(', ')}`);
  if (match.exclusions.length > 0) parts.push(`without ${match.exclusions.join(', ')}`);
  return parts.join(', ');
}

function parseLeadingQuantity(raw: string): (ParsedQuantity & { valid: boolean }) | null {
  const leading = raw.match(/^\s*/)?.[0].length ?? 0;
  const body = raw.slice(leading);
  const negative = body.match(new RegExp(`^-\\s*(?:${QUANTITY_NUMBER})\\s+(?:${QUANTITY_UNIT})\\b`, 'i'));
  if (negative) {
    return { valid: false, amount: 0, unit: '', consumed: leading + negative[0].length };
  }
  const fraction = body.match(new RegExp(`^(\\d+)\\s*/\\s*(\\d+)\\s+(${QUANTITY_UNIT})\\b`, 'i'));
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    const consumed = leading + fraction[0].length;
    if (!(denominator > 0) || !(numerator >= 0) || !Number.isFinite(numerator / denominator)) {
      return { valid: false, amount: 0, unit: '', consumed };
    }
    return {
      valid: true,
      amount: numerator / denominator,
      unit: canonicalUnit(fraction[3]),
      consumed,
    };
  }
  const decimal = body.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s+(${QUANTITY_UNIT})\\b`, 'i'));
  if (!decimal) return null;
  const amount = Number(decimal[1]);
  const consumed = leading + decimal[0].length;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, amount: 0, unit: '', consumed };
  }
  return { valid: true, amount, unit: canonicalUnit(decimal[2]), consumed };
}

function measureSupported(
  quantity: ParsedFoodQuantity | null,
  measures?: Array<{ unit: string; grams: number; label?: string }> | null,
  servingSizeG?: number | null,
): boolean {
  if (!quantity) return false;
  const unit = normalizeUnit(quantity.unit);
  if (unit === 'serving') return true;
  if (unit === 'g') return typeof servingSizeG === 'number' && servingSizeG > 0;
  const measure = findMeasure(unit, measures);
  return Boolean(measure && measure.grams > 0);
}

function formatQuantity(quantity: ParsedFoodQuantity): string {
  const amount = Number.isInteger(quantity.amount)
    ? String(quantity.amount)
    : String(quantity.amount);
  return `${amount} ${quantity.unit}`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface ParsedQuantity extends ParsedFoodQuantity {
  consumed: number;
}

function canonicalUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === 'cup' || lower === 'cups') return 'cup';
  if (lower === 'tablespoon' || lower === 'tablespoons' || lower === 'tbsp') return 'tablespoon';
  if (lower === 'teaspoon' || lower === 'teaspoons' || lower === 'tsp') return 'teaspoon';
  if (lower === 'ounce' || lower === 'ounces' || lower === 'oz') return 'oz';
  if (lower === 'gram' || lower === 'grams' || lower === 'g') return 'g';
  if (lower === 'serving' || lower === 'servings') return 'serving';
  if (lower === 'piece' || lower === 'pieces') return 'piece';
  if (lower === 'slice' || lower === 'slices') return 'slice';
  return lower;
}

function foldText(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function protectedTokenIndexes(tokens: string[]): Set<number> {
  const indexes = new Set<number>();
  const phrases = [...PROTECTED_PHRASES].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    for (let start = 0; start <= tokens.length - phrase.length; start += 1) {
      const matches = phrase.every((word, offset) => tokens[start + offset] === word);
      if (!matches) continue;
      let already = false;
      for (let offset = 0; offset < phrase.length; offset += 1) {
        if (indexes.has(start + offset)) already = true;
      }
      if (already) continue;
      for (let offset = 0; offset < phrase.length; offset += 1) indexes.add(start + offset);
    }
  }
  return indexes;
}

function collectConstraintPhrase(
  tokens: string[],
  start: number,
  protectedIndexes: Set<number>,
): { words: string[]; indexes: number[] } {
  const words: string[] = [];
  const indexes: number[] = [];
  for (let i = start; i < tokens.length; i += 1) {
    if (protectedIndexes.has(i)) break;
    const token = tokens[i];
    if (token === 'and' || token === 'or') {
      const next = tokens[i + 1];
      if (next && (ADDITION_WORDS.has(next) || VARIANT_TO_METHOD.has(next))) {
        words.push(token);
        indexes.push(i);
        continue;
      }
      break;
    }
    if (ADDITION_WORDS.has(token) || VARIANT_TO_METHOD.has(token)) {
      words.push(token);
      indexes.push(i);
      continue;
    }
    break;
  }
  return { words, indexes };
}
