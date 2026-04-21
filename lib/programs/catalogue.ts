/**
 * Program catalogue — Phase 11 + Phase 12 delivery resolver.
 *
 * Phase 11 shipped an in-code PROGRAM_CATALOGUE stub. Phase 12 adds a
 * managed DB-backed catalogue (`programs` table); this module now acts
 * as the resolver that prefers the managed catalogue and falls back to
 * the in-code stub when no `programs` row is published for the slug.
 *
 * The shape of `ProgramCatalogueEntry` is stable across both paths:
 * user-facing UI never has to know whether it was managed or stubbed.
 * The `is_stub` flag is the one signal callers use to decide whether
 * to show a "content coming soon" affordance.
 */

import { slugToTitle } from '@/lib/plans/programRuntimeSummaryServerService';
import {
  getPublishedProgramHeadersBySlugs,
  getPublishedProgramTreeBySlug,
  type PublishedProgram,
} from './programContentDeliveryServerService';

export type ProgramModuleKind =
  | 'video'
  | 'worksheet'
  | 'article'
  | 'guidance'
  | 'milestone'
  | 'other';

export interface ProgramModuleSummary {
  id: string;
  title: string;
  kind: ProgramModuleKind;
  /** User-safe one-liner (no admin JSON). */
  summary: string | null;
  /**
   * Estimated minutes to complete the module (V1 metadata only; not a
   * runtime tracker).
   */
  estimated_minutes: number | null;
}

export interface ProgramCatalogueEntry {
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  /**
   * Summarized module outline. For managed content this is a list of
   * module titles; for stubs it's the hardcoded outline. Empty array
   * means "no outline to show" — the detail page can still render the
   * `managed_content` tree if that's populated separately.
   */
  modules: ProgramModuleSummary[];
  storefront_href: string | null;
  /** True when this entry came from the in-code fallback, not the DB. */
  is_stub: boolean;
}

// ============================================================================
// In-code fallback catalogue (Phase 11)
// ============================================================================

const STUB_CATALOGUE: Record<string, ProgramCatalogueEntry> = {
  'gut-check': {
    slug: 'gut-check',
    title: 'Gut Check',
    tagline:
      'A guided reset to identify foods that work with your body and rebuild digestive resilience.',
    description:
      'Gut Check helps you zero in on what your body responds to best. Over its length, the program layers in structured meal timing, an emphasis on whole, digestible foods, and light elimination — then walks you through a reintroduction sequence so you can read your own signals clearly. It runs alongside Plans, contributing plan guidance while you track outcomes in your Journal.',
    modules: [
      {
        id: 'orientation',
        title: 'Orientation & baseline',
        kind: 'article',
        summary:
          'What to expect week by week, and how to set up your baseline.',
        estimated_minutes: 10,
      },
      {
        id: 'reset-week',
        title: 'Reset week',
        kind: 'guidance',
        summary:
          'Remove common irritants, emphasize easy-to-digest whole foods, steady meal spacing.',
        estimated_minutes: 15,
      },
      {
        id: 'reintro-sequence',
        title: 'Reintroduction sequence',
        kind: 'guidance',
        summary:
          'Structured reintroduction of common trigger categories, one at a time, with tracking prompts.',
        estimated_minutes: 20,
      },
      {
        id: 'consolidation',
        title: 'Consolidation',
        kind: 'milestone',
        summary: 'Lock in what worked and transition to a maintenance rhythm.',
        estimated_minutes: 10,
      },
    ],
    storefront_href: '/programs',
    is_stub: true,
  },
};

function emptyStub(slug: string): ProgramCatalogueEntry {
  return {
    slug,
    title: slugToTitle(slug),
    tagline: null,
    description: null,
    modules: [],
    storefront_href: null,
    is_stub: true,
  };
}

/**
 * Synchronous stub-only lookup. Kept for test / utility paths that
 * cannot go async; production delivery goes through
 * `resolveProgramCatalogueEntry`.
 */
export function getProgramCatalogueEntry(
  slug: string,
): ProgramCatalogueEntry {
  const known = STUB_CATALOGUE[slug];
  if (known) return known;
  return emptyStub(slug);
}

export function getProgramCatalogueEntries(
  slugs: string[],
): ProgramCatalogueEntry[] {
  return slugs.map(getProgramCatalogueEntry);
}

// ============================================================================
// Phase 12 — managed resolver
// ============================================================================

function headerToEntry(
  published: PublishedProgram,
): ProgramCatalogueEntry {
  return {
    slug: published.slug,
    title: published.title,
    tagline: published.tagline,
    description: published.description,
    modules: published.modules.map((m) => ({
      id: m.id,
      title: m.title,
      kind: 'guidance' as ProgramModuleKind,
      summary: m.description,
      estimated_minutes: m.items.reduce((acc, i) => {
        return acc + (i.estimated_minutes ?? 0);
      }, 0) || null,
    })),
    storefront_href: published.storefront_href,
    is_stub: false,
  };
}

/**
 * Resolve a single entry, preferring the managed DB catalogue and
 * falling back to the in-code stub.
 */
export async function resolveProgramCatalogueEntry(
  slug: string,
): Promise<ProgramCatalogueEntry> {
  const managed = await getPublishedProgramTreeBySlug(slug);
  if (managed) return headerToEntry(managed);
  return getProgramCatalogueEntry(slug);
}

/**
 * Bulk resolve. Missing slugs fall through to the in-code stub.
 */
export async function resolveProgramCatalogueEntries(
  slugs: string[],
): Promise<ProgramCatalogueEntry[]> {
  const headers = await getPublishedProgramHeadersBySlugs(slugs);
  return slugs.map((slug) => {
    const managed = headers.get(slug.toLowerCase());
    if (managed) {
      // Managed-but-empty modules: use header metadata, drop the stub
      // module outline so the UI renders an empty state for content
      // until the admin adds modules/items.
      return headerToEntry(managed);
    }
    return getProgramCatalogueEntry(slug);
  });
}

export function listKnownCatalogueSlugs(): string[] {
  return Object.keys(STUB_CATALOGUE);
}
