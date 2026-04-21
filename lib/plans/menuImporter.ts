/**
 * Plans — Menu importer (Packet 5)
 *
 * Deterministic parser that turns a restaurant menu into the structured
 * `ImportedMenuPayload` shape locked in §4b of Packet 5:
 *
 *   {
 *     sections: Array<{
 *       section_name: string | null;
 *       items: Array<{ item_name, description, price_text, nutrition_text }>;
 *     }>;
 *   }
 *
 * Supported inputs:
 *
 *   - pasted menu text (manual_paste source)
 *   - normalized text rendering of a structured schema.org Menu JSON-LD
 *     node produced by `menuUrlFetcher.ts`
 *
 * NOT in scope here:
 *   - OCR / image menus
 *   - AI normalization of unstructured prose
 *
 * Recommendation generation is a separate module (`eatOutRecommender`).
 * This file only parses. Per Packet 5 §5b, weak parses must still
 * preserve the raw input and land in `manual_review` upstream.
 *
 * Pure functions only — no Supabase, no fetch, no side effects. Safe to
 * test in isolation.
 */

import type {
  ImportedMenuPayload,
  ImportedMenuParseStatus,
  ImportedMenuSection,
  ImportedMenuSectionItem,
} from './types';

// ============================================================================
// Section + item detection heuristics
// ============================================================================

/** A recognizable section header line (all caps, or line ending with `:`). */
function looksLikeSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  if (/^[-=_*]+$/.test(trimmed)) return false;
  if (/^\d/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  // Ends with a colon — `Appetizers:` / `Mains:`
  if (/:\s*$/.test(trimmed)) return true;
  // All caps word(s) — `APPETIZERS` / `SMALL PLATES`
  const upperRatio =
    letters.length > 0
      ? letters.replace(/[^A-Z]/g, '').length / letters.length
      : 0;
  if (upperRatio >= 0.8 && !/[.!?]$/.test(trimmed)) return true;
  // Markdown-ish heading — `# Appetizers` / `## Mains`
  if (/^#{1,3}\s+\S/.test(trimmed)) return true;
  return false;
}

function cleanSectionName(raw: string): string {
  return raw
    .replace(/^#{1,3}\s+/, '')
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull a price token (`$12`, `$12.50`, `12`, `12.5`) off the end of a
 * line. We keep the text form verbatim since menu prices are a display
 * concern, not a numeric input.
 */
const PRICE_TAIL_RE =
  /(\s+[-–—•·]\s*)?\$?\s*(\d{1,3}(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*$/;

function extractPrice(raw: string): { text: string; price_text: string | null } {
  const match = PRICE_TAIL_RE.exec(raw);
  if (!match) return { text: raw.trim(), price_text: null };
  const priceToken = match[0].trim();
  const stripped = raw.slice(0, raw.length - match[0].length).trim();
  if (stripped.length === 0) return { text: raw.trim(), price_text: null };
  return { text: stripped, price_text: priceToken.replace(/^\s*[-–—•·]\s*/, '') };
}

/**
 * Pull a trailing nutrition hint (`(450 cal)`, `— 32g protein`) off
 * the end of an item line. Keeps the text form because menus phrase
 * this many different ways.
 */
const NUTRITION_TAIL_RES: RegExp[] = [
  /\s*\((\d+\s*(?:cal|calories|kcal|protein|g\s*protein)\b[^)]*)\)\s*$/i,
  /\s*[-–—]\s*(\d+\s*(?:cal|calories|kcal|protein|g\s*protein)\b[^-–—]*)$/i,
];

function extractNutrition(raw: string): {
  text: string;
  nutrition_text: string | null;
} {
  for (const re of NUTRITION_TAIL_RES) {
    const m = re.exec(raw);
    if (m) {
      const stripped = raw.slice(0, raw.length - m[0].length).trim();
      return { text: stripped, nutrition_text: m[1].trim() };
    }
  }
  return { text: raw.trim(), nutrition_text: null };
}

/**
 * Split an item line into `item_name` and optional `description`. Most
 * menus use either ` — ` (em dash) or ` - ` or `:` to separate.
 */
function splitItemNameAndDescription(raw: string): {
  item_name: string;
  description: string | null;
} {
  const dashSplit = /\s+[—–-]\s+/.exec(raw);
  if (dashSplit && dashSplit.index > 0) {
    const name = raw.slice(0, dashSplit.index).trim();
    const desc = raw.slice(dashSplit.index + dashSplit[0].length).trim();
    if (name.length > 0 && desc.length > 0) {
      return { item_name: name, description: desc };
    }
  }
  const colonSplit = /:\s+/.exec(raw);
  if (colonSplit && colonSplit.index > 0 && colonSplit.index < raw.length - 1) {
    const name = raw.slice(0, colonSplit.index).trim();
    const desc = raw.slice(colonSplit.index + colonSplit[0].length).trim();
    if (name.length > 0 && desc.length > 0 && desc.length < 200) {
      return { item_name: name, description: desc };
    }
  }
  return { item_name: raw.trim(), description: null };
}

function parseItemLine(raw: string): ImportedMenuSectionItem | null {
  let working = raw.replace(/^\s*[-*•·]\s+/, '').trim();
  if (working.length === 0) return null;

  const { text: afterPrice, price_text } = extractPrice(working);
  working = afterPrice;

  const { text: afterNutrition, nutrition_text } = extractNutrition(working);
  working = afterNutrition;

  const { item_name, description } = splitItemNameAndDescription(working);
  if (item_name.trim().length === 0) return null;

  return {
    item_name: item_name.trim(),
    description: description && description.length > 0 ? description : null,
    price_text: price_text,
    nutrition_text: nutrition_text,
  };
}

/**
 * A continuation line that looks like a description attached to the
 * previous item (starts lowercase, or is short) — common in menu PDFs
 * that wrap long item descriptions onto a second line.
 */
function looksLikeDescriptionContinuation(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 160) return false;
  if (looksLikeSectionHeader(t)) return false;
  if (/^[-*•·]\s/.test(t)) return false;
  if (/^\s*\$?\s*\d/.test(t)) return false;
  const first = t[0] ?? '';
  return first.toLowerCase() === first;
}

// ============================================================================
// Main parse pipeline
// ============================================================================

export interface RunMenuImportArgs {
  text: string | null;
  url: string | null;
  restaurant_name: string | null;
}

export interface MenuImportResult {
  payload: ImportedMenuPayload;
  parse_status: ImportedMenuParseStatus;
  notes: string | null;
}

/**
 * Parse a plain-text menu body into the locked ImportedMenuPayload shape.
 *
 * Parse-status ladder (mirrors imported_meals §5b of Packet 5):
 *   - `parsed`        — at least one section with one item
 *   - `manual_review` — input present but heuristics could not find
 *                       meaningful structure (still persisted raw)
 *   - `failed`        — no input at all (upstream should block)
 */
export function runMenuImport(args: RunMenuImportArgs): MenuImportResult {
  const text = args.text?.trim() ?? '';
  if (text.length === 0) {
    return {
      payload: { sections: [] },
      parse_status: 'failed',
      notes: 'No menu text provided.',
    };
  }

  const sections = splitSections(text);

  const hasItems = sections.some((s) => s.items.length > 0);
  if (!hasItems) {
    // Fall back to a single "Menu" section with best-effort item
    // extraction, but land in manual_review so the user knows quality
    // is low.
    return {
      payload: {
        sections: [
          {
            section_name: null,
            items: bestEffortFlatItems(text),
          },
        ],
      },
      parse_status: 'manual_review',
      notes:
        'Menu structure was not clearly detected. Review and edit section/item boundaries manually.',
    };
  }

  return {
    payload: { sections },
    parse_status: 'parsed',
    notes: null,
  };
}

function splitSections(text: string): ImportedMenuSection[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\t/g, '  '));

  const sections: ImportedMenuSection[] = [];
  let currentName: string | null = null;
  let currentItems: ImportedMenuSectionItem[] = [];

  const flush = () => {
    if (currentName !== null || currentItems.length > 0) {
      sections.push({ section_name: currentName, items: currentItems });
    }
    currentName = null;
    currentItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.length === 0) continue;

    if (looksLikeSectionHeader(line)) {
      flush();
      currentName = cleanSectionName(line);
      continue;
    }

    if (
      currentItems.length > 0 &&
      looksLikeDescriptionContinuation(line) &&
      currentItems[currentItems.length - 1].description === null
    ) {
      currentItems[currentItems.length - 1] = {
        ...currentItems[currentItems.length - 1],
        description: line,
      };
      continue;
    }

    const parsed = parseItemLine(line);
    if (parsed) currentItems.push(parsed);
  }
  flush();

  return sections.filter(
    (s) => s.section_name !== null || s.items.length > 0,
  );
}

function bestEffortFlatItems(text: string): ImportedMenuSectionItem[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => parseItemLine(l))
    .filter((x): x is ImportedMenuSectionItem => x !== null);
}

// ============================================================================
// URL hostname helpers (shared with the fetcher)
// ============================================================================

const VIDEO_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'instagram.com',
  'www.instagram.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
]);

export function isLikelyVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return VIDEO_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
