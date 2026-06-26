/**
 * Programs Marketing — data adapter
 *
 * Read adapter for Programs marketing product records and compositions, mirroring
 * lib/integrativeCareApi.ts. The composition-driven marketing pages and (later)
 * admin routes call these functions only — never Supabase or the filesystem
 * directly.
 *
 * Persistence:
 *   Product record:  site_content  key = product:programs:{slug}
 *   Composition:     site_content  key = composition:programs:{slug}
 *   status field:    'draft' | 'published'  (matches site_content.status column)
 *
 * Marketing slug encodes the Programs hierarchy (Category -> Collection ->
 * Program). A collection page uses the collection slug directly; a program page
 * uses the `{collectionSlug}--{programSlug}` form (the same `--` convention used
 * by the integrative-care composition files):
 *   collection:  nutrition
 *   program:     nutrition--baseline
 * Use `buildProgramMarketingSlug` / `parseProgramMarketingSlug` rather than
 * hand-building these strings.
 *
 * Read strategy (both operations):
 *   1. Try Supabase (server-only)
 *   2. Fall back to JSON files for local dev / seed data
 *
 * Writes:
 *   Intentionally NOT implemented here yet. Seeding site_content rows and any
 *   publish endpoints are approval-gated (require schema/admin/publishing
 *   sign-off). The code catalogue (programSeriesCatalogue) remains the source of
 *   truth until that flip is approved; this adapter is additive and read-only.
 */

import { z } from 'zod';
import type {
  ModuleInstance,
  ModuleTypeKey,
  PageComposition,
} from '../modules/types';
import { pageCompositionSchema, MODULE_CONTENT_SCHEMAS } from '../modules/schema';

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const programsMarketingProductSchema = z.object({
  /** Marketing-entity slug: collection slug, or `{collection}--{program}`. */
  slug: z.string(),
  category: z.literal('programs'),
  templateFamily: z.literal('programs'),
  /** Which marketing surface this record describes. */
  kind: z.enum(['collection', 'program']),
  /** The owning program collection (storage: program_series). */
  collectionSlug: z.string(),
  /** Set only when kind === 'program'. */
  programSlug: z.string().optional(),
  status: z.enum(['draft', 'published']),
  title: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  sortOrder: z.number().int(),
});

export type ProgramsMarketingProduct = z.infer<
  typeof programsMarketingProductSchema
>;

// ─── Slug helpers ─────────────────────────────────────────────────────────────

/** Build the marketing slug for a collection (no program) or a program. */
export function buildProgramMarketingSlug(
  collectionSlug: string,
  programSlug?: string | null,
): string {
  return programSlug ? `${collectionSlug}--${programSlug}` : collectionSlug;
}

/** Inverse of buildProgramMarketingSlug. */
export function parseProgramMarketingSlug(slug: string): {
  collectionSlug: string;
  programSlug: string | null;
} {
  const [collectionSlug, programSlug] = slug.split('--');
  return { collectionSlug, programSlug: programSlug ?? null };
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

export function productKey(slug: string) {
  return `product:programs:${slug}` as const;
}

export function compositionKey(slug: string) {
  return `composition:programs:${slug}` as const;
}

// ─── Read: product record ─────────────────────────────────────────────────────

/**
 * Load one product record by marketing slug. Tries Supabase, falls back to JSON.
 * Pass status = 'draft' to load drafts (admin preview only).
 */
export async function getProgramsMarketingProductRecord(
  slug: string,
  status: 'draft' | 'published' = 'published',
): Promise<ProgramsMarketingProduct | null> {
  const safe = sanitizeSlug(slug);
  if (!safe || safe !== slug) return null;

  // ── Supabase ──
  try {
    const { supabaseAdmin } = await import('../supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', productKey(safe))
      .eq('status', status)
      .maybeSingle();

    if (!error && data?.data) {
      const result = programsMarketingProductSchema.safeParse(data.data);
      if (result.success) return result.data;
    }
  } catch {
    // Supabase unavailable — fall through to JSON
  }

  // ── JSON fallback (local dev / seed) ──
  try {
    const record = await import(`@/data/products/programs/${safe}.json`);
    const result = programsMarketingProductSchema.safeParse(record.default);
    if (!result.success) return null;
    if (result.data.status !== status) return null;
    return result.data;
  } catch {
    return null;
  }
}

// ─── Read: product list ───────────────────────────────────────────────────────

/**
 * List all Programs marketing product records. Admin use: returns both draft and
 * published. Public use: pass publishedOnly = true. Reads both sources and
 * deduplicates by slug (Supabase wins over JSON seed).
 */
export async function listProgramsMarketingProducts(
  publishedOnly = false,
): Promise<ProgramsMarketingProduct[]> {
  const bySlug = new Map<string, ProgramsMarketingProduct>();

  // ── JSON seed (loaded first so Supabase can overwrite) ──
  try {
    const index = await import('@/data/products/programs/index.json');
    const entries = index.default as Array<{
      slug: string;
      status: string;
      sortOrder: number;
    }>;
    const filtered = publishedOnly
      ? entries.filter((e) => e.status === 'published')
      : entries;

    for (const entry of filtered) {
      try {
        const rec = await import(`@/data/products/programs/${entry.slug}.json`);
        const parsed = programsMarketingProductSchema.safeParse(rec.default);
        if (parsed.success) bySlug.set(parsed.data.slug, parsed.data);
      } catch {
        // Skip missing files
      }
    }
  } catch {
    // No index file — JSON source unavailable
  }

  // ── Supabase (overwrites JSON entries for the same slug) ──
  try {
    const { supabaseAdmin } = await import('../supabaseServerClient');
    let query = supabaseAdmin
      .from('site_content')
      .select('data, status')
      .like('key', 'product:programs:%')
      .order('key');

    if (publishedOnly) {
      query = query.eq('status', 'published');
    }

    const { data, error } = await query;

    if (!error && data) {
      for (const row of data) {
        const parsed = programsMarketingProductSchema.safeParse(row.data);
        if (parsed.success) bySlug.set(parsed.data.slug, parsed.data);
      }
    }
  } catch {
    // Supabase unavailable — JSON results stand
  }

  return Array.from(bySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

// ─── Read: composition ────────────────────────────────────────────────────────

/**
 * Load the composition for a marketing slug. Tries Supabase, falls back to JSON.
 */
export async function getProgramsMarketingComposition(
  slug: string,
  status: 'draft' | 'published' = 'published',
): Promise<PageComposition | null> {
  const safe = sanitizeSlug(slug);
  if (!safe || safe !== slug) return null;

  // ── Supabase ──
  try {
    const { supabaseAdmin } = await import('../supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', compositionKey(safe))
      .eq('status', status)
      .maybeSingle();

    if (!error && data?.data) {
      return validateComposition(data.data);
    }
  } catch {
    // Fall through
  }

  // ── JSON fallback (bundled static import — works on Vercel) ──
  try {
    const file = await import(`@/data/compositions/programs--${safe}.json`);
    return validateComposition(file.default);
  } catch {
    return null;
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/** Allow the `--` hierarchy separator alongside the standard slug charset. */
function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '');
}

function validateComposition(raw: unknown): PageComposition | null {
  const topLevel = pageCompositionSchema.safeParse(raw);
  if (!topLevel.success) return null;

  const { key, version, modules: looseModules } = topLevel.data;
  const validatedModules: ModuleInstance[] = [];

  for (const mod of looseModules) {
    const contentSchema = MODULE_CONTENT_SCHEMAS[mod.type as ModuleTypeKey];
    if (!contentSchema) continue;
    const result = contentSchema.safeParse(mod.content);
    if (!result.success) continue;
    validatedModules.push({
      id: mod.id,
      type: mod.type as ModuleTypeKey,
      content: result.data,
    } as ModuleInstance);
  }

  return { key, version, modules: validatedModules };
}
