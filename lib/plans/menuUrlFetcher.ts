/**
 * Plans — Menu URL fetcher (Packet 5)
 *
 * Server-side fetcher that pulls a restaurant menu page and extracts a
 * plain-text menu body that the deterministic parser
 * (`menuImporter.runMenuImport`) can turn into the locked
 * ImportedMenuPayload shape.
 *
 * Extraction strategy (in order):
 *
 *   1. schema.org Restaurant/Menu JSON-LD — menus embedded in Restaurant
 *      structured data via `hasMenu` or a standalone Menu node. This is
 *      rare compared to Recipe JSON-LD, but some national chains do it.
 *   2. Microdata `itemtype="http://schema.org/MenuSection"` blocks.
 *   3. Plain-text extraction fallback — strip scripts/styles, collapse
 *      whitespace, return the visible body text. The menu importer's
 *      heuristics then attempt section/item detection and land in
 *      `manual_review` if the signal is too weak.
 *
 * On failure we return `null`. The caller lands the import in
 * `manual_review` preserving the raw URL. We NEVER throw into the API
 * response — Packet 5 §5b requires raw-input preservation over silent
 * drops.
 *
 * No AI calls. Provider-free.
 */

interface SchemaMenuItem {
  name?: unknown;
  description?: unknown;
  offers?: unknown;
  nutrition?: unknown;
  suitableForDiet?: unknown;
}

interface SchemaMenuSection {
  name?: unknown;
  hasMenuItem?: unknown;
  hasMenuSection?: unknown;
}

interface SchemaMenu {
  name?: unknown;
  hasMenuSection?: unknown;
  hasMenuItem?: unknown;
}

interface SchemaRestaurant {
  name?: unknown;
  hasMenu?: unknown;
}

export interface FetchedMenuShape {
  restaurant_name: string | null;
  sections: Array<{
    section_name: string | null;
    items: Array<{
      item_name: string;
      description: string | null;
      price_text: string | null;
      nutrition_text: string | null;
    }>;
  }>;
}

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; FineDietMenuFetcher/1.0; +https://finediet.app/bot)';

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('xml')) {
      return null;
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const body = match[1].trim();
    if (body.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(body);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // Skip malformed JSON-LD — some sites inject tracking comments.
    }
  }
  return blocks;
}

function getType(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const t = (node as Record<string, unknown>)['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

function findNodesByType(blocks: unknown[], wanted: string): unknown[] {
  const found: unknown[] = [];
  const seen = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const types = getType(node).map((x) => x.toLowerCase());
    if (types.includes(wanted.toLowerCase())) found.push(node);
    const graph = (node as Record<string, unknown>)['@graph'];
    if (Array.isArray(graph)) graph.forEach(visit);
    for (const key of Object.keys(node as Record<string, unknown>)) {
      if (key === '@graph' || key === '@type' || key === '@context') continue;
      const child = (node as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  blocks.forEach(visit);
  return found;
}

function coerceString(v: unknown): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    return s.length === 0 ? null : s;
  }
  return null;
}

function coerceArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return [v];
  return [];
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function priceFromOffers(offers: unknown): string | null {
  const arr = coerceArray(offers);
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue;
    const price = (o as Record<string, unknown>)['price'];
    const currency = (o as Record<string, unknown>)['priceCurrency'];
    const priceStr = coerceString(price) ?? (typeof price === 'number' ? String(price) : null);
    if (priceStr) {
      return currency === 'USD' || currency === undefined || currency === null
        ? `$${priceStr}`
        : `${priceStr} ${coerceString(currency) ?? ''}`.trim();
    }
  }
  return null;
}

function nutritionFromMenuItem(item: SchemaMenuItem): string | null {
  const n = item.nutrition;
  if (!n || typeof n !== 'object') return null;
  const rec = n as Record<string, unknown>;
  const parts: string[] = [];
  const calories = coerceString(rec['calories']);
  if (calories) parts.push(calories);
  const protein = coerceString(rec['proteinContent']);
  if (protein) parts.push(`${protein} protein`);
  const fat = coerceString(rec['fatContent']);
  if (fat) parts.push(`${fat} fat`);
  const carbs = coerceString(rec['carbohydrateContent']);
  if (carbs) parts.push(`${carbs} carbs`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function convertMenuItem(node: unknown): FetchedMenuShape['sections'][number]['items'][number] | null {
  if (!node || typeof node !== 'object') return null;
  const item = node as SchemaMenuItem;
  const name = coerceString(item.name);
  if (!name) return null;
  return {
    item_name: name,
    description: coerceString(item.description),
    price_text: priceFromOffers(item.offers),
    nutrition_text: nutritionFromMenuItem(item),
  };
}

function convertMenuSection(node: unknown): FetchedMenuShape['sections'][number] | null {
  if (!node || typeof node !== 'object') return null;
  const section = node as SchemaMenuSection;
  const items: FetchedMenuShape['sections'][number]['items'] = [];
  for (const i of coerceArray(section.hasMenuItem)) {
    const conv = convertMenuItem(i);
    if (conv) items.push(conv);
  }
  // schema.org allows nested sections (e.g. Dinner → Mains → …). For V1
  // we flatten one level into the parent section; deeply nested menus
  // will be truncated but never lose top-level items.
  for (const sub of coerceArray(section.hasMenuSection)) {
    if (!sub || typeof sub !== 'object') continue;
    const subSection = sub as SchemaMenuSection;
    for (const i of coerceArray(subSection.hasMenuItem)) {
      const conv = convertMenuItem(i);
      if (conv) items.push(conv);
    }
  }
  if (items.length === 0) return null;
  return {
    section_name: coerceString(section.name),
    items,
  };
}

function extractPageTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const t = decodeHtmlEntities(m[1]).trim();
  return t.length === 0 ? null : t;
}

/**
 * Try to build a structured menu from schema.org JSON-LD. Returns null
 * if no parseable Menu / Restaurant.hasMenu content is found.
 */
function extractFromJsonLd(blocks: unknown[]): FetchedMenuShape | null {
  const sections: FetchedMenuShape['sections'] = [];
  let restaurant_name: string | null = null;

  // Look for an explicit Menu node first.
  for (const menu of findNodesByType(blocks, 'Menu')) {
    const m = menu as SchemaMenu;
    for (const s of coerceArray(m.hasMenuSection)) {
      const conv = convertMenuSection(s);
      if (conv) sections.push(conv);
    }
    // Menus can also have loose items outside sections.
    const looseItems: FetchedMenuShape['sections'][number]['items'] = [];
    for (const i of coerceArray(m.hasMenuItem)) {
      const conv = convertMenuItem(i);
      if (conv) looseItems.push(conv);
    }
    if (looseItems.length > 0) {
      sections.push({ section_name: coerceString(m.name), items: looseItems });
    }
  }

  // Also check Restaurant.hasMenu references.
  for (const restaurant of findNodesByType(blocks, 'Restaurant')) {
    const r = restaurant as SchemaRestaurant;
    restaurant_name = restaurant_name ?? coerceString(r.name);
    for (const menu of coerceArray(r.hasMenu)) {
      if (!menu || typeof menu !== 'object') continue;
      const m = menu as SchemaMenu;
      for (const s of coerceArray(m.hasMenuSection)) {
        const conv = convertMenuSection(s);
        if (conv) sections.push(conv);
      }
    }
  }

  if (sections.length === 0) return null;
  return { restaurant_name, sections };
}

// ============================================================================
// Public entry points
// ============================================================================

/**
 * Fetch a menu URL and extract structured menu content. Returns null
 * if the URL cannot be fetched or no structured content is detected.
 */
export async function fetchMenuFromUrl(
  url: string,
): Promise<FetchedMenuShape | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  const blocks = extractJsonLdBlocks(html);
  const jsonLd = extractFromJsonLd(blocks);
  if (jsonLd) {
    return {
      restaurant_name: jsonLd.restaurant_name ?? extractPageTitle(html),
      sections: jsonLd.sections,
    };
  }

  // No structured menu JSON-LD — return null so the caller lands in
  // manual_review with the raw input preserved. We don't synthesize
  // weak menu structure from arbitrary HTML body text: that is exactly
  // the "pretending certainty" failure mode Packet 5 §11 warns against.
  return null;
}

/**
 * Render a structured FetchedMenuShape back to a plain-text body that
 * the deterministic menu parser (`runMenuImport`) can consume. This
 * keeps the parse step single-source: the importer sees the same line
 * format whether the input was pasted or fetched from schema.org.
 */
export function renderFetchedMenuAsText(shape: FetchedMenuShape): string {
  const lines: string[] = [];
  for (const section of shape.sections) {
    if (section.section_name) {
      lines.push('');
      lines.push(`${section.section_name}:`);
    }
    for (const item of section.items) {
      let line = item.item_name;
      if (item.description) line += ` — ${item.description}`;
      if (item.price_text) line += ` ${item.price_text}`;
      if (item.nutrition_text) line += ` (${item.nutrition_text})`;
      lines.push(line);
    }
  }
  return lines.join('\n').trim();
}

export { stripHtmlTags as stripHtmlTagsForDebug };
