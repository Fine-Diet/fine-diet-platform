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
 *   Service-role only. The upsert/delete helpers below run exclusively through
 *   `supabaseAdmin` and are called only by the admin API layer
 *   (`/api/admin/programs-marketing/*`), which is gated by
 *   `requireRoleFromApi(..., ['admin'])`. There is no authenticated-client write
 *   path (site_content RLS also enforces service-role-only writes). The code
 *   catalogue (programSeriesCatalogue) remains the public source of truth until a
 *   collection/program is intentionally published through the publish gate
 *   (a PUBLISHED product record AND a PUBLISHED composition).
 */

import { z } from 'zod';
import type {
  ModuleInstance,
  ModuleTypeKey,
  PageComposition,
} from '../modules/types';
import { pageCompositionSchema, MODULE_CONTENT_SCHEMAS } from '../modules/schema';
import {
  inspectComposition,
  type InspectedComposition,
} from '../modules/compositionValidation';

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

/**
 * Map a marketing slug to its public route path, used for ISR revalidation after
 * an admin write/publish. Collection slugs map to `/programs/{collection}`;
 * program slugs (`{collection}--{program}`) map to `/programs/{collection}/{program}`.
 */
export function programMarketingPublicPath(slug: string): string {
  const { collectionSlug, programSlug } = parseProgramMarketingSlug(slug);
  return programSlug
    ? `/programs/${collectionSlug}/${programSlug}`
    : `/programs/${collectionSlug}`;
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

/**
 * AUTHORING read: load a composition WITHOUT dropping invalid modules.
 *
 * Unlike `getProgramsMarketingComposition` (which strict-validates and drops
 * invalid modules for safe public rendering), this preserves every stored
 * module and returns per-module validity so the admin editor can keep partial /
 * newly added modules editable and explain what is wrong. Reads Supabase first,
 * then the JSON fallback — mirroring the strict reader's sources.
 */
export async function getProgramsMarketingCompositionForEditing(
  slug: string,
  status: 'draft' | 'published' = 'draft',
): Promise<InspectedComposition | null> {
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
      return inspectComposition(data.data);
    }
  } catch {
    // Fall through
  }

  // ── JSON fallback ──
  try {
    const file = await import(`@/data/compositions/programs--${safe}.json`);
    return inspectComposition(file.default);
  } catch {
    return null;
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/** Allow the `--` hierarchy separator alongside the standard slug charset. */
function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Validate + normalize a raw composition. Exported for unit testing of the
 * read-path safety contract: unknown module types and modules whose content
 * fails its schema are dropped; malformed top-level shapes return null. Pure —
 * no I/O, no behavior change vs. the inlined version.
 */
export function validateComposition(raw: unknown): PageComposition | null {
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

// ─── Write: product record (service-role only) ─────────────────────────────────

/**
 * Create or update a Programs marketing product record. Writes to the status
 * carried on the record (`record.status`). Service-role only via supabaseAdmin.
 */
export async function upsertProgramsMarketingProduct(
  record: ProgramsMarketingProduct,
): Promise<{ success: boolean; error?: string }> {
  const validated = programsMarketingProductSchema.safeParse(record);
  if (!validated.success) {
    return { success: false, error: validated.error.message };
  }

  const safe = sanitizeSlug(record.slug);
  if (!safe || safe !== record.slug) {
    return { success: false, error: 'Invalid slug' };
  }

  try {
    const { supabaseAdmin } = await import('../supabaseServerClient');
    const { error } = await supabaseAdmin.from('site_content').upsert(
      {
        key: productKey(safe),
        status: validated.data.status,
        data: validated.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key,status' },
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

// ─── Write: composition (service-role only) ────────────────────────────────────

/**
 * Save a Programs marketing composition under composition:programs:{slug} at the
 * given status (defaults to draft). Service-role only via supabaseAdmin.
 */
export async function upsertProgramsMarketingComposition(
  slug: string,
  composition: PageComposition,
  status: 'draft' | 'published' = 'draft',
): Promise<{ success: boolean; error?: string }> {
  const safe = sanitizeSlug(slug);
  if (!safe || safe !== slug) return { success: false, error: 'Invalid slug' };

  try {
    const { supabaseAdmin } = await import('../supabaseServerClient');
    const { error } = await supabaseAdmin.from('site_content').upsert(
      {
        key: compositionKey(safe),
        status,
        data: composition,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key,status' },
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

// ─── Delete: product record (service-role only) ────────────────────────────────

/**
 * Delete a Programs marketing product record at the given status. Used by the
 * admin DELETE endpoint, which restricts deletion to draft rows. Service-role
 * only via supabaseAdmin.
 */
export async function deleteProgramsMarketingProduct(
  slug: string,
  status: 'draft' | 'published' = 'draft',
): Promise<{ success: boolean; error?: string }> {
  const safe = sanitizeSlug(slug);
  if (!safe || safe !== slug) return { success: false, error: 'Invalid slug' };

  try {
    const { supabaseAdmin } = await import('../supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('site_content')
      .delete()
      .eq('key', productKey(safe))
      .eq('status', status);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}
