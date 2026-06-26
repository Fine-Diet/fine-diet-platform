/**
 * Program Runtime Packet 23 — public program series delivery service.
 *
 * Public marketing routes prefer published DB-authored program series. If no
 * published DB series are available, or the additive table is not present yet,
 * they fall back to the code-owned catalogue in `programSeriesCatalogue.ts`.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  getProgramBySlugWithinSeries,
  getProgramSeriesProgramBySlugs,
  getProgramSeriesProgramStaticPaths as getCodeProgramPaths,
  getProgramSeriesStaticPaths as getCodeSeriesPaths,
  getPublishedProgramSeries as getCodePublishedProgramSeries,
  PROGRAM_SERIES_CATALOGUE,
} from './programSeriesCatalogue';
import type {
  ProgramSeriesCategory,
  ProgramSeriesDefinition,
  ProgramSeriesProgramDefinition,
  ProgramSeriesProgramResolution,
} from './programSeriesTypes';
import {
  rowToProgramSeries,
  rowToProgramSeriesItem,
  type ProgramSeriesItemRow,
  type ProgramSeriesRow,
} from './programSeriesAdminServerService';

type ProgramSeriesDbRow = Parameters<typeof rowToProgramSeries>[0];
type ProgramSeriesItemDbRow = Parameters<typeof rowToProgramSeriesItem>[0];

export type ProgramSeriesCatalogueSource = 'admin' | 'code';

export interface ProgramSeriesCatalogueResult {
  source: ProgramSeriesCatalogueSource;
  series: ProgramSeriesDefinition[];
}

const DEFAULT_HERO_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776806738515-Navigation-Featured-Image-Intensive.jpg';
const CATEGORIES: ProgramSeriesCategory[] = [
  'nutrition',
  'dietary',
  'lifestyle',
  'advanced',
  'support',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value.filter((item) => item.trim())
    : undefined;
}

function normalizeCategory(value: string | null): ProgramSeriesCategory {
  return CATEGORIES.includes(value as ProgramSeriesCategory)
    ? (value as ProgramSeriesCategory)
    : 'support';
}

function findCodeOwnedProgram(
  programSlug: string,
): ProgramSeriesProgramDefinition | null {
  const normalized = programSlug.trim().toLowerCase();
  for (const series of PROGRAM_SERIES_CATALOGUE) {
    const program = getProgramBySlugWithinSeries(series, normalized);
    if (program) return program;
  }
  return null;
}

function metadataProgramStatus(
  metadata: Record<string, unknown>,
): ProgramSeriesProgramDefinition['status'] {
  return metadata.programStatus === 'available' ||
    metadata.programStatus === 'coming_soon' ||
    metadata.programStatus === 'planned'
    ? metadata.programStatus
    : 'planned';
}

export function mapDbSeriesToDefinition(input: {
  series: ProgramSeriesRow;
  items: ProgramSeriesItemRow[];
}): ProgramSeriesDefinition {
  const { series, items } = input;
  const publishedItems = items
    .filter((item) => item.status === 'published')
    .slice()
    .sort((a, b) => a.display_order - b.display_order);

  const programs = publishedItems.map((item) => {
    const codeProgram = findCodeOwnedProgram(item.program_slug);
    const itemMetadata = item.metadata ?? {};
    const cta = isRecord(itemMetadata.cta)
      ? {
          label: optionalString(itemMetadata.cta.label) ?? 'Learn more',
          href: optionalString(itemMetadata.cta.href),
          offerKey: optionalString(itemMetadata.cta.offerKey),
          disabled:
            typeof itemMetadata.cta.disabled === 'boolean'
              ? itemMetadata.cta.disabled
              : undefined,
          helperText: optionalString(itemMetadata.cta.helperText),
        }
      : codeProgram?.cta;

    return {
      slug: item.program_slug,
      title:
        item.title_override ??
        optionalString(itemMetadata.title) ??
        codeProgram?.title ??
        item.program_slug,
      subtitle: optionalString(itemMetadata.subtitle) ?? codeProgram?.subtitle,
      description:
        item.description_override ??
        optionalString(itemMetadata.description) ??
        codeProgram?.description ??
        'Public program overview.',
      lengthLabel:
        optionalString(itemMetadata.lengthLabel) ?? codeProgram?.lengthLabel,
      status: codeProgram?.status ?? metadataProgramStatus(itemMetadata),
      objective: optionalString(itemMetadata.objective) ?? codeProgram?.objective,
      whoFor: optionalStringArray(itemMetadata.whoFor) ?? codeProgram?.whoFor,
      whatYouWillDo:
        optionalStringArray(itemMetadata.whatYouWillDo) ??
        codeProgram?.whatYouWillDo,
      cta,
    };
  });

  return {
    slug: series.slug,
    title: series.title,
    subtitle: series.subtitle ?? '',
    description: series.description ?? '',
    category: normalizeCategory(series.category),
    programSlugs: programs.map((program) => program.slug),
    programs,
    heroImageUrl: series.hero_image_url ?? DEFAULT_HERO_IMAGE_URL,
    status: series.status,
    displayOrder: series.display_order,
    cta: {
      label: series.primary_cta_label ?? 'Learn more',
      href: series.primary_cta_href ?? `/programs/${series.slug}`,
    },
    secondaryCta:
      series.secondary_cta_label || series.secondary_cta_href
        ? {
            label: series.secondary_cta_label ?? 'Manage my programs',
            href: series.secondary_cta_href ?? '/app/programs',
          }
        : {
            label: 'Manage my programs',
            href: '/app/programs',
          },
    whoFor: optionalStringArray(series.metadata.whoFor) ?? [],
    whatYouWillDo: optionalStringArray(series.metadata.whatYouWillDo) ?? [],
    metadata: {
      ...series.metadata,
      ownership: 'admin_managed',
      fallbackAvailable: true,
    },
  };
}

async function fetchPublishedDbSeries(): Promise<ProgramSeriesDefinition[]> {
  const { data: seriesData, error: seriesError } = await supabaseAdmin
    .from('program_series')
    .select('*')
    .eq('status', 'published')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (seriesError) {
    console.warn('[program-series] published series error:', seriesError.message);
    return [];
  }

  const seriesRows = ((seriesData ?? []) as ProgramSeriesDbRow[]).map(
    rowToProgramSeries,
  );
  if (seriesRows.length === 0) return [];

  const seriesIds = seriesRows.map((series) => series.id);
  const { data: itemData, error: itemError } = await supabaseAdmin
    .from('program_series_items')
    .select('*')
    .in('series_id', seriesIds)
    .eq('status', 'published')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (itemError) {
    console.warn('[program-series] published items error:', itemError.message);
    return [];
  }

  const items = ((itemData ?? []) as ProgramSeriesItemDbRow[]).map(
    rowToProgramSeriesItem,
  );
  return seriesRows.map((series) =>
    mapDbSeriesToDefinition({
      series,
      items: items.filter((item) => item.series_id === series.id),
    }),
  );
}

export async function getPublishedProgramSeriesWithFallback(): Promise<ProgramSeriesCatalogueResult> {
  const dbSeries = await fetchPublishedDbSeries();
  if (dbSeries.length > 0) {
    return { source: 'admin', series: dbSeries };
  }
  return { source: 'code', series: getCodePublishedProgramSeries() };
}

export async function getPublishedProgramSeriesForPublic(): Promise<
  ProgramSeriesDefinition[]
> {
  return (await getPublishedProgramSeriesWithFallback()).series;
}

export async function getProgramSeriesBySlugForPublic(
  slug: string,
): Promise<ProgramSeriesDefinition | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const { series } = await getPublishedProgramSeriesWithFallback();
  return series.find((item) => item.slug === normalized) ?? null;
}

export async function getProgramSeriesProgramBySlugsForPublic(
  seriesSlug: string,
  programSlug: string,
): Promise<ProgramSeriesProgramResolution | null> {
  const series = await getProgramSeriesBySlugForPublic(seriesSlug);
  if (!series) return null;

  const program = getProgramBySlugWithinSeries(series, programSlug);
  if (!program) return null;

  const index = series.programs.findIndex((item) => item.slug === program.slug);
  return {
    series,
    program,
    index,
    previousProgram: index > 0 ? series.programs[index - 1] : null,
    nextProgram:
      index >= 0 && index < series.programs.length - 1
        ? series.programs[index + 1]
        : null,
  };
}

export async function getProgramSeriesStaticPathsForPublic(): Promise<string[]> {
  const result = await getPublishedProgramSeriesWithFallback();
  return result.source === 'admin'
    ? result.series.map((series) => series.slug)
    : getCodeSeriesPaths();
}

export async function getProgramSeriesProgramStaticPathsForPublic(): Promise<
  Array<{ series: string; program: string }>
> {
  const result = await getPublishedProgramSeriesWithFallback();
  if (result.source === 'code') return getCodeProgramPaths();
  return result.series.flatMap((series) =>
    series.programs.map((program) => ({
      series: series.slug,
      program: program.slug,
    })),
  );
}

export async function getCodeOwnedProgramSeriesProgramBySlugs(
  seriesSlug: string,
  programSlug: string,
): Promise<ProgramSeriesProgramResolution | null> {
  return getProgramSeriesProgramBySlugs(seriesSlug, programSlug);
}
