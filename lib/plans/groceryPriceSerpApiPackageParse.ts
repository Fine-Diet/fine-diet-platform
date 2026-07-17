/**
 * Parse grocery package size/unit from SerpAPI Google Shopping row fields.
 *
 * Uses only fields already present on shopping_results rows — no immersive
 * product follow-up requests.
 */

export type SerpApiPackageSource =
  | 'structured'
  | 'extensions'
  | 'tagline'
  | 'title'
  | 'snippet';

export interface ParsedGroceryPackage {
  package_size: number | null;
  package_unit: string | null;
  package_text: string | null;
  source: SerpApiPackageSource | null;
}

export interface SerpApiShoppingPackageRow {
  title?: string;
  tagline?: string;
  snippet?: string;
  tag?: string;
  extensions?: string[];
  specs?: SerpApiStructuredEntry[] | Record<string, string | number | null>;
  product_attributes?: SerpApiStructuredEntry[];
  product_details?: SerpApiStructuredEntry[] | Record<string, string | number | null>;
  product_variations?: SerpApiStructuredEntry[];
}

export interface SerpApiStructuredEntry {
  name?: string;
  title?: string;
  value?: string;
  description?: string;
  text?: string;
}

const NON_PACKAGE_TEXT_RE =
  /^(in store|nearby,?|local|sale|curbside|pickup|\d+\s*%\s*off|free\s+\d|get it|tastes good|user reviews?|small business)/i;

const STRUCTURED_PACKAGE_KEY_RE =
  /^(size|net wt|net weight|weight|volume|package size|unit count|count|package weight)$/i;

const COUNT_ONLY_RE = /\b(?:pack of|count|\d+\s*pack|\d+\s*ct|\d+\s*count)\b/i;

const PACKAGE_IN_TEXT_RE =
  /\b(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?(oz|lb|lbs|g|kg|ml|l|ct|count)\b|\b(\d+(?:\.\d+)?)\s*-?\s*(ounce|ounces|pound|pounds|gram|grams|kilogram|kilograms|milliliter|milliliters|liter|liters|litre|litres)\b/gi;

const NUTRITION_BEFORE_RE =
  /\b(?:protein|carb(?:ohydrate)?s?|fat|fiber|fibre|sugar|sodium|cholesterol|calcium|iron|potassium|serving(?:\s+size)?)\s*:?\s*$/i;
const NUTRITION_AFTER_RE =
  /^\s*(?:[·,;|/-]\s*)*(?:of\s+)?(?:(?:high|added)\s+)?(?:protein|carb(?:ohydrate)?s?|fat|fiber|fibre|sugar|sodium|cholesterol|calcium|iron|potassium)\b/i;
const SERVING_CONTEXT_BEFORE_RE = /\b(?:serving size|per serving)\s*:?\s*$/i;
const SERVING_CONTEXT_AFTER_RE = /^\s*(?:[·,;|/-]\s*)*(?:per serving|serving)\b/i;
const MODEL_CONTEXT_BEFORE_RE = /\b(?:model|model no|item|item no|sku|series)\s*[-#:]*\s*$/i;
const DIMENSION_CONTEXT_BEFORE_RE = /\b(?:dimensions?|measures?|measurement)\s*:?\s*[^,;]{0,24}$/i;

export function normalizeGroceryPackageUnit(unit: string): string {
  const lower = unit.toLowerCase().replace(/\./g, '');
  const map: Record<string, string> = {
    ounce: 'oz',
    ounces: 'oz',
    oz: 'oz',
    pound: 'lb',
    pounds: 'lb',
    lb: 'lb',
    lbs: 'lb',
    gram: 'g',
    grams: 'g',
    g: 'g',
    kilogram: 'kg',
    kilograms: 'kg',
    kg: 'kg',
    milliliter: 'ml',
    milliliters: 'ml',
    ml: 'ml',
    liter: 'l',
    liters: 'l',
    litre: 'l',
    litres: 'l',
    l: 'l',
    ct: 'ct',
    count: 'ct',
  };
  return map[lower] ?? lower;
}

function formatPackageLabel(size: number, unit: string): string {
  return `${size} ${normalizeGroceryPackageUnit(unit)}`;
}

function isAmbiguousCountOnly(text: string): boolean {
  return COUNT_ONLY_RE.test(text) && !/\b(oz|lb|lbs|g|kg|ml|l|fl)\b/i.test(text);
}

export function parseGroceryPackageFromText(text: string): ParsedGroceryPackage | null {
  const trimmed = text.trim();
  if (!trimmed || NON_PACKAGE_TEXT_RE.test(trimmed)) {
    return null;
  }
  if (isAmbiguousCountOnly(trimmed)) {
    return null;
  }

  const candidates: ParsedGroceryPackage[] = [];
  PACKAGE_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PACKAGE_IN_TEXT_RE.exec(trimmed)) != null) {
    const rawSize = match[1] ?? match[3];
    const rawUnit = match[2] ?? match[4];
    if (!rawSize || !rawUnit) continue;

    const before = trimmed.slice(Math.max(0, match.index - 48), match.index);
    const after = trimmed.slice(PACKAGE_IN_TEXT_RE.lastIndex, PACKAGE_IN_TEXT_RE.lastIndex + 40);
    if (
      NUTRITION_BEFORE_RE.test(before)
      || NUTRITION_AFTER_RE.test(after)
      || SERVING_CONTEXT_BEFORE_RE.test(before)
      || SERVING_CONTEXT_AFTER_RE.test(after)
      || MODEL_CONTEXT_BEFORE_RE.test(before)
      || DIMENSION_CONTEXT_BEFORE_RE.test(before)
      || /^\s*(?:[·,;|/-]\s*)*(?:\d+(?:\.\d+)?\s*)?%/.test(after)
    ) {
      continue;
    }

    const size = Number(rawSize);
    if (!Number.isFinite(size) || size <= 0) continue;

    const unit = normalizeGroceryPackageUnit(rawUnit);
    candidates.push({
      package_size: size,
      package_unit: unit,
      package_text: formatPackageLabel(size, unit),
      source: null,
    });
  }

  return chooseBestPackage(candidates);
}

function withSource(
  parsed: ParsedGroceryPackage | null,
  source: SerpApiPackageSource,
): ParsedGroceryPackage | null {
  if (!parsed) return null;
  return { ...parsed, source };
}

function collectStructuredTexts(row: SerpApiShoppingPackageRow): string[] {
  const texts: string[] = [];

  const pushEntry = (name: string | undefined, value: string | undefined) => {
    const trimmedName = name?.trim();
    const trimmedValue = value?.trim();
    if (!trimmedName || !trimmedValue) return;
    if (!STRUCTURED_PACKAGE_KEY_RE.test(trimmedName)) return;
    texts.push(`${trimmedName}: ${trimmedValue}`);
    texts.push(trimmedValue);
  };

  const handleEntries = (entries: SerpApiStructuredEntry[] | undefined) => {
    for (const entry of entries ?? []) {
      pushEntry(entry.name ?? entry.title, entry.value ?? entry.description ?? entry.text);
    }
  };

  handleEntries(row.product_attributes);
  handleEntries(row.product_variations);
  handleEntries(row.specs as SerpApiStructuredEntry[] | undefined);
  handleEntries(row.product_details as SerpApiStructuredEntry[] | undefined);

  const recordSources = [row.specs, row.product_details] as Array<
    Record<string, string | number | null> | SerpApiStructuredEntry[] | undefined
  >;
  for (const source of recordSources) {
    if (!source || Array.isArray(source)) continue;
    for (const [name, value] of Object.entries(source)) {
      if (value == null) continue;
      pushEntry(name, String(value));
    }
  }

  return texts;
}

function parseCandidatesFromTexts(
  texts: string[],
  source: SerpApiPackageSource,
): ParsedGroceryPackage[] {
  const parsed: ParsedGroceryPackage[] = [];
  for (const text of texts) {
    const result = withSource(parseGroceryPackageFromText(text), source);
    if (result) {
      parsed.push(result);
    }
  }
  return parsed;
}

function chooseBestPackage(candidates: ParsedGroceryPackage[]): ParsedGroceryPackage | null {
  if (candidates.length === 0) {
    return null;
  }

  const uniqueKeys = new Set(
    candidates.map((candidate) => `${candidate.package_size}:${candidate.package_unit}`),
  );
  if (uniqueKeys.size > 1) return null;

  return candidates[0] ?? null;
}

export function extractPackageFromSerpApiShoppingRow(
  row: SerpApiShoppingPackageRow,
): ParsedGroceryPackage {
  const candidates: ParsedGroceryPackage[] = [];

  candidates.push(...parseCandidatesFromTexts(collectStructuredTexts(row), 'structured'));

  for (const extension of row.extensions ?? []) {
    candidates.push(...parseCandidatesFromTexts([extension], 'extensions'));
  }

  if (row.tagline?.trim()) {
    candidates.push(...parseCandidatesFromTexts([row.tagline], 'tagline'));
  }

  if (row.title?.trim()) {
    candidates.push(...parseCandidatesFromTexts([row.title], 'title'));
  }

  if (row.snippet?.trim()) {
    candidates.push(...parseCandidatesFromTexts([row.snippet], 'snippet'));
  }

  const best = chooseBestPackage(candidates);
  return (
    best ?? {
      package_size: null,
      package_unit: null,
      package_text: null,
      source: null,
    }
  );
}

export function parsedPackageToCandidateFields(parsed: ParsedGroceryPackage): {
  package_text: string | null;
  package_size: number | null;
  package_unit: string | null;
} {
  return {
    package_text: parsed.package_text,
    package_size: parsed.package_size,
    package_unit: parsed.package_unit,
  };
}
