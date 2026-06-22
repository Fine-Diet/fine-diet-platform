/**
 * Start Pages — data adapter.
 *
 * All reads/writes for Start Page records go through this module. Admin APIs and
 * public SSR resolution call these functions only — never Supabase directly.
 *
 * Persistence: public.start_pages (see scripts/sql/createStartPagesTable.sql).
 *   - Two rows max per slug: one `draft`, one `published` (+ optional `archived`).
 *   - Publishing copies the draft row into the published row.
 *
 * Server-only by construction: every function dynamically imports the
 * service-role client, so this module is never bundled into client code.
 */

import {
  startPageRecordSchema,
  routePathForSlug,
  type StartPageRecord,
  type StartPageStatus,
} from './startPageSchema';

const SAFE_COLUMNS =
  'slug, route_path, template_key, primary_offer_key, price_option_keys, status, seo_title, seo_description, config_json';

interface StartPageRow {
  slug: string;
  route_path: string;
  template_key: string;
  primary_offer_key: string;
  price_option_keys: string[] | null;
  status: string;
  seo_title: string | null;
  seo_description: string | null;
  config_json: unknown;
}

/** Parse a DB row into a validated record (camelCase). Returns null if invalid. */
function rowToRecord(row: StartPageRow): StartPageRecord | null {
  const parsed = startPageRecordSchema.safeParse({
    slug: row.slug,
    routePath: row.route_path,
    templateKey: row.template_key,
    primaryOfferKey: row.primary_offer_key,
    priceOptionKeys: row.price_option_keys ?? [],
    status: row.status,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    config: row.config_json ?? {},
  });
  return parsed.success ? parsed.data : null;
}

function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

/** Load one Start Page record by slug + status. */
export async function getStartPageBySlug(
  slug: string,
  status: StartPageStatus = 'published',
): Promise<StartPageRecord | null> {
  if (!isSafeSlug(slug)) return null;
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('start_pages')
      .select(SAFE_COLUMNS)
      .eq('slug', slug)
      .eq('status', status)
      .maybeSingle();

    if (error || !data) return null;
    return rowToRecord(data as StartPageRow);
  } catch {
    return null;
  }
}

/** Load a published Start Page record by its public route path. */
export async function getPublishedStartPageByRoute(
  routePath: string,
): Promise<StartPageRecord | null> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('start_pages')
      .select(SAFE_COLUMNS)
      .eq('route_path', routePath)
      .eq('status', 'published')
      .maybeSingle();

    if (error || !data) return null;
    return rowToRecord(data as StartPageRow);
  } catch {
    return null;
  }
}

export interface StartPageSummary {
  slug: string;
  routePath: string;
  status: StartPageStatus;
  primaryOfferKey: string;
  priceOptionKeys: string[];
  templateKey: string;
  seoTitle: string | null;
}

/**
 * List Start Pages for the admin UI. Collapses draft/published/archived rows for
 * the same slug into a single summary, preferring the most "editable" status
 * (draft > published > archived) for display, while surfacing whether a live
 * published row exists.
 */
export async function listStartPages(): Promise<
  Array<StartPageSummary & { hasPublished: boolean; hasDraft: boolean }>
> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('start_pages')
      .select(SAFE_COLUMNS)
      .order('slug', { ascending: true });

    if (error || !data) return [];

    const bySlug = new Map<
      string,
      { rows: StartPageRow[]; }
    >();
    for (const raw of data as StartPageRow[]) {
      const entry = bySlug.get(raw.slug) ?? { rows: [] };
      entry.rows.push(raw);
      bySlug.set(raw.slug, entry);
    }

    const statusRank: Record<string, number> = { draft: 0, published: 1, archived: 2 };
    const summaries: Array<StartPageSummary & { hasPublished: boolean; hasDraft: boolean }> = [];

    bySlug.forEach(({ rows }, slug) => {
      const sorted = [...rows].sort(
        (a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9),
      );
      const primary = sorted[0];
      summaries.push({
        slug,
        routePath: primary.route_path,
        status: primary.status as StartPageStatus,
        primaryOfferKey: primary.primary_offer_key,
        priceOptionKeys: primary.price_option_keys ?? [],
        templateKey: primary.template_key,
        seoTitle: primary.seo_title,
        hasPublished: rows.some((r) => r.status === 'published'),
        hasDraft: rows.some((r) => r.status === 'draft'),
      });
    });

    return summaries.sort((a, b) => a.slug.localeCompare(b.slug));
  } catch {
    return [];
  }
}

/**
 * Create or update a Start Page row (validated). Writes to the status carried on
 * the record. Returns the persisted record on success.
 */
export async function upsertStartPage(
  record: StartPageRecord,
  actorUserId?: string | null,
): Promise<{ success: boolean; error?: string; record?: StartPageRecord }> {
  const validated = startPageRecordSchema.safeParse(record);
  if (!validated.success) {
    return { success: false, error: validated.error.message };
  }
  const value = validated.data;

  if (value.routePath !== routePathForSlug(value.slug)) {
    return {
      success: false,
      error: `route_path "${value.routePath}" does not match slug "${value.slug}"`,
    };
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('start_pages')
      .upsert(
        {
          slug: value.slug,
          route_path: value.routePath,
          template_key: value.templateKey,
          primary_offer_key: value.primaryOfferKey,
          price_option_keys: value.priceOptionKeys,
          status: value.status,
          seo_title: value.seoTitle ?? null,
          seo_description: value.seoDescription ?? null,
          config_json: value.config,
          updated_at: new Date().toISOString(),
          updated_by: actorUserId ?? null,
        },
        { onConflict: 'slug,status' },
      );

    if (error) return { success: false, error: error.message };
    return { success: true, record: value };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

/** Delete a single status row for a slug (used to clear archived rows). */
export async function deleteStartPageRow(
  slug: string,
  status: StartPageStatus,
): Promise<{ success: boolean; error?: string }> {
  if (!isSafeSlug(slug)) return { success: false, error: 'Invalid slug' };
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('start_pages')
      .delete()
      .eq('slug', slug)
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

/**
 * Delete every row (draft + published + archived) for a slug. Used by the
 * admin-only "Delete page" cleanup so test pages don't leave residual archived
 * rows behind. Presentation only — never touches billing/entitlement data.
 */
export async function deleteAllStartPageRows(
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isSafeSlug(slug)) return { success: false, error: 'Invalid slug' };
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('start_pages')
      .delete()
      .eq('slug', slug);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}
