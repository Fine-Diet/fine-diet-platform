/**
 * Plans — Recipe URL fetcher (Phase 4 completion)
 *
 * Server-side fetcher that pulls a recipe page and extracts structured
 * recipe fields (title, ingredients, instructions, servings) from one
 * of:
 *
 *   1. schema.org Recipe JSON-LD (the modern standard most recipe
 *      sites publish; covers AllRecipes, NYT Cooking, Serious Eats,
 *      Food Network, Bon Appétit, Smitten Kitchen, etc.)
 *   2. Microdata fallback via `itemprop="recipeIngredient"` and
 *      `itemprop="recipeInstructions"` class selectors (best-effort).
 *
 * On failure, returns `null` and the caller lands the import in
 * `manual_review`. We never throw into the API response — a failed
 * URL fetch should still produce an `imported_meal` draft the user can
 * complete manually.
 *
 * Scope: Packet 4 QA feedback called out that recipe URL import was
 * advertised by the packet contract (AC #2) but the initial stub only
 * captured the URL in manual_review. This file closes that gap without
 * introducing AI dependencies or expanding the packet boundary. The
 * fetch is provider-free and runs server-side only.
 */

interface SchemaRecipe {
  name?: unknown;
  description?: unknown;
  recipeYield?: unknown;
  recipeIngredient?: unknown;
  ingredients?: unknown;
  recipeInstructions?: unknown;
}

export interface FetchedRecipeShape {
  title: string | null;
  description: string | null;
  servings: number | null;
  ingredient_lines: string[];
  step_lines: string[];
}

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; FineDietRecipeFetcher/1.0; +https://finediet.app/bot)';

/**
 * Fetch a URL with a timeout; returns the HTML body or null on any
 * error (network, non-2xx, timeout, non-text content).
 */
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

/**
 * Extract every `<script type="application/ld+json">` payload from the
 * HTML body. Tolerant of minor whitespace variation but not a full
 * HTML parser — this is deliberate to keep the dependency surface
 * zero.
 */
function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Some sites embed invalid JSON (comments, trailing commas).
      // Attempt a forgiving cleanup: strip common offenders and retry.
      try {
        const cleaned = raw
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        blocks.push(JSON.parse(cleaned));
      } catch {
        // Skip — one bad block shouldn't tank the whole page.
      }
    }
  }
  return blocks;
}

/** Recursively walk a JSON-LD tree looking for `@type: 'Recipe'`. */
function findRecipeNode(node: unknown): SchemaRecipe | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const r = findRecipeNode(child);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  const types = Array.isArray(t) ? t : typeof t === 'string' ? [t] : [];
  if (types.some((x) => typeof x === 'string' && x.toLowerCase() === 'recipe')) {
    return obj as SchemaRecipe;
  }
  // Walk @graph (common on sites using the Yoast SEO plugin) and any
  // nested object values.
  const graph = obj['@graph'];
  if (graph) {
    const r = findRecipeNode(graph);
    if (r) return r;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const r = findRecipeNode(v);
      if (r) return r;
    }
  }
  return null;
}

function coerceString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    const first = v.find((x) => typeof x === 'string');
    return typeof first === 'string' ? first.trim() || null : null;
  }
  if (v && typeof v === 'object') {
    // { "@value": "..." } pattern
    const inner = (v as Record<string, unknown>)['@value'];
    if (typeof inner === 'string') return inner.trim() || null;
  }
  return null;
}

function coerceStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          // HowToStep shape: { "@type": "HowToStep", "text": "...", "name": "..." }
          if (typeof rec.text === 'string') return rec.text.trim();
          if (typeof rec.name === 'string') return rec.name.trim();
          // HowToSection.itemListElement: recurse one level.
          if (Array.isArray(rec.itemListElement)) {
            return coerceStringArray(rec.itemListElement).join(' ');
          }
        }
        return '';
      })
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof v === 'string') {
    // Some sites pack instructions as a single string with \n separators
    // or numbered prose. Split conservatively on newlines and numbered
    // prefixes.
    return v
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function coerceServings(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /(\d+(?:\.\d+)?)/.exec(v);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = coerceServings(item);
      if (r !== null) return r;
    }
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function stripHtmlTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

/**
 * Microdata fallback — very lightweight regex scan for
 * `itemprop="recipeIngredient"` spans on the page. Used when no
 * JSON-LD Recipe is present.
 */
function extractMicrodataIngredients(html: string): string[] {
  const re =
    /<[^>]+itemprop\s*=\s*["'](?:recipeIngredient|ingredient)["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const txt = stripHtmlTags(m[1]);
    if (txt.length > 0) out.push(txt);
  }
  return out;
}

function extractMicrodataInstructions(html: string): string[] {
  const re =
    /<[^>]+itemprop\s*=\s*["']recipeInstructions?["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const txt = stripHtmlTags(m[1]);
    if (txt.length > 0) out.push(txt);
  }
  return out;
}

function extractPageTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const t = stripHtmlTags(m[1]);
  return t.length > 0 ? t : null;
}

/**
 * Fetch + parse a recipe URL into the shape the text-path parser
 * expects. Returns null when nothing usable was extracted.
 */
export async function fetchRecipeFromUrl(
  url: string,
): Promise<FetchedRecipeShape | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  // --- JSON-LD first --------------------------------------------------
  const blocks = extractJsonLdBlocks(html);
  for (const block of blocks) {
    const recipe = findRecipeNode(block);
    if (!recipe) continue;
    const ingredientsRaw =
      (recipe.recipeIngredient as unknown) ?? (recipe.ingredients as unknown);
    const ingredient_lines = coerceStringArray(ingredientsRaw).map(stripHtmlTags);
    const step_lines = coerceStringArray(recipe.recipeInstructions).map(
      stripHtmlTags,
    );
    const title = coerceString(recipe.name);
    const description = coerceString(recipe.description);
    const servings = coerceServings(recipe.recipeYield);
    if (ingredient_lines.length > 0 || step_lines.length > 0) {
      return {
        title,
        description: description ? stripHtmlTags(description) : null,
        servings,
        ingredient_lines,
        step_lines,
      };
    }
  }

  // --- Microdata fallback --------------------------------------------
  const microIngredients = extractMicrodataIngredients(html);
  const microSteps = extractMicrodataInstructions(html);
  if (microIngredients.length > 0 || microSteps.length > 0) {
    return {
      title: extractPageTitle(html),
      description: null,
      servings: null,
      ingredient_lines: microIngredients,
      step_lines: microSteps,
    };
  }

  return null;
}

/**
 * Render a FetchedRecipeShape into a text paste the deterministic
 * text parser understands. This lets us reuse the same section parser,
 * ingredient heuristics, and nutrition estimator across the paste path
 * and the URL path without a second engine.
 */
export function renderFetchedRecipeAsText(shape: FetchedRecipeShape): string {
  const parts: string[] = [];
  if (shape.title) parts.push(shape.title);
  if (shape.description) parts.push(shape.description);
  if (shape.servings !== null) parts.push(`Servings: ${shape.servings}`);
  if (shape.ingredient_lines.length > 0) {
    parts.push('Ingredients');
    parts.push(shape.ingredient_lines.join('\n'));
  }
  if (shape.step_lines.length > 0) {
    parts.push('Instructions');
    parts.push(
      shape.step_lines
        .map((s, i) => `${i + 1}. ${s}`)
        .join('\n'),
    );
  }
  return parts.join('\n\n');
}
