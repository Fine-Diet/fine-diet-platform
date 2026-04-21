/**
 * Plans Phase 12 — Managed content delivery (server-only)
 *
 * User-facing read path over programs / program_modules /
 * program_content_items. Only published rows are returned, and only
 * when the slug has a matching managed program. Callers pair this with
 * the Packet 11 access check (entitled OR assigned) before delivering.
 *
 * Returns `null` when no managed content exists for the slug, so the
 * catalogue layer can fall back to the in-code stub.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  Program,
  ProgramContentItem,
  ProgramContentItemType,
  ProgramModule,
  ProgramStatus,
  ProgramWithTree,
} from './contentTypes';

// ============================================================================
// Public shapes
// ============================================================================

export interface PublishedModule {
  id: string;
  title: string;
  description: string | null;
  ordinal: number;
  items: PublishedContentItem[];
}

export interface PublishedContentItem {
  id: string;
  item_type: ProgramContentItemType;
  title: string;
  summary: string | null;
  body: string | null;
  video_url: string | null;
  video_provider: string | null;
  estimated_minutes: number | null;
  ordinal: number;
}

export interface PublishedProgram {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  storefront_href: string | null;
  modules: PublishedModule[];
}

// ============================================================================
// Row shapes (narrow — delivery reads trimmed column sets)
// ============================================================================

interface ProgramRow {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  storefront_href: string | null;
  status: ProgramStatus;
}

interface ModuleRow {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  ordinal: number;
  status: ProgramStatus;
}

interface ItemRow {
  id: string;
  module_id: string;
  item_type: ProgramContentItemType;
  title: string;
  summary: string | null;
  body: string | null;
  video_url: string | null;
  video_provider: string | null;
  estimated_minutes: number | null;
  ordinal: number;
  status: ProgramStatus;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns the published program tree for a slug, or `null` when no
 * `programs` row exists with that slug. An existing-but-unpublished
 * program also returns `null` so drafts never leak to the user.
 */
export async function getPublishedProgramTreeBySlug(
  slug: string,
): Promise<PublishedProgram | null> {
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) return null;

  const { data: programRows, error: programErr } = await supabaseAdmin
    .from('programs')
    .select('id, slug, title, tagline, description, storefront_href, status')
    .eq('slug', trimmed)
    .limit(1);
  if (programErr) {
    console.warn(
      '[programs/delivery] getPublishedProgramTreeBySlug programs error:',
      programErr.message,
    );
    return null;
  }
  const programRow = (programRows ?? [])[0] as ProgramRow | undefined;
  if (!programRow || programRow.status !== 'published') return null;

  const { data: moduleData, error: moduleErr } = await supabaseAdmin
    .from('program_modules')
    .select('id, program_id, title, description, ordinal, status')
    .eq('program_id', programRow.id)
    .eq('status', 'published')
    .order('ordinal', { ascending: true });
  if (moduleErr) {
    console.warn(
      '[programs/delivery] modules error:',
      moduleErr.message,
    );
    return {
      id: programRow.id,
      slug: programRow.slug,
      title: programRow.title,
      tagline: programRow.tagline,
      description: programRow.description,
      storefront_href: programRow.storefront_href,
      modules: [],
    };
  }
  const modules = (moduleData ?? []) as ModuleRow[];

  let items: ItemRow[] = [];
  if (modules.length > 0) {
    const { data: itemData, error: itemErr } = await supabaseAdmin
      .from('program_content_items')
      .select(
        'id, module_id, item_type, title, summary, body, video_url, video_provider, estimated_minutes, ordinal, status',
      )
      .in(
        'module_id',
        modules.map((m) => m.id),
      )
      .eq('status', 'published')
      .order('ordinal', { ascending: true });
    if (itemErr) {
      console.warn(
        '[programs/delivery] items error:',
        itemErr.message,
      );
    } else {
      items = (itemData ?? []) as ItemRow[];
    }
  }

  const itemsByModule = new Map<string, ItemRow[]>();
  for (const it of items) {
    const list = itemsByModule.get(it.module_id) ?? [];
    list.push(it);
    itemsByModule.set(it.module_id, list);
  }

  return {
    id: programRow.id,
    slug: programRow.slug,
    title: programRow.title,
    tagline: programRow.tagline,
    description: programRow.description,
    storefront_href: programRow.storefront_href,
    modules: modules.map<PublishedModule>((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      ordinal: m.ordinal,
      items: (itemsByModule.get(m.id) ?? []).map<PublishedContentItem>((i) => ({
        id: i.id,
        item_type: i.item_type,
        title: i.title,
        summary: i.summary,
        body: i.body,
        video_url: i.video_url,
        video_provider: i.video_provider,
        estimated_minutes: i.estimated_minutes,
        ordinal: i.ordinal,
      })),
    })),
  };
}

/**
 * Lightweight lookup used by the library list page: returns published
 * catalogue metadata for a set of slugs, keyed by slug. Missing slugs
 * simply aren't in the map and the caller falls back to the stub.
 */
export async function getPublishedProgramHeadersBySlugs(
  slugs: string[],
): Promise<Map<string, PublishedProgram>> {
  const unique = Array.from(new Set(slugs.map((s) => s.toLowerCase())));
  const result = new Map<string, PublishedProgram>();
  if (unique.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from('programs')
    .select('id, slug, title, tagline, description, storefront_href, status')
    .in('slug', unique)
    .eq('status', 'published');
  if (error) {
    console.warn(
      '[programs/delivery] getPublishedProgramHeadersBySlugs error:',
      error.message,
    );
    return result;
  }
  for (const row of (data ?? []) as ProgramRow[]) {
    result.set(row.slug, {
      id: row.id,
      slug: row.slug,
      title: row.title,
      tagline: row.tagline,
      description: row.description,
      storefront_href: row.storefront_href,
      modules: [],
    });
  }
  return result;
}

// Convenience re-exports so callers don't have to pull from two places.
export type {
  Program,
  ProgramContentItem,
  ProgramModule,
  ProgramWithTree,
};
