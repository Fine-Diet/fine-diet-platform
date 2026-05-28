/**
 * Program Runtime Packet 23 — program series admin service (server-only).
 *
 * CRUD + item ordering for admin-authored public marketing program series.
 * These rows are additive; the code-owned series catalogue remains the public
 * route fallback until DB-authored series are proven.
 */

import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { ProgramStatus } from './contentTypes';

export type ProgramSeriesStatus = ProgramStatus;

export interface ProgramSeriesRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  hero_image_url: string | null;
  status: ProgramSeriesStatus;
  display_order: number;
  primary_cta_label: string | null;
  primary_cta_href: string | null;
  secondary_cta_label: string | null;
  secondary_cta_href: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProgramSeriesItemRow {
  id: string;
  series_id: string;
  program_slug: string;
  title_override: string | null;
  description_override: string | null;
  display_order: number;
  status: ProgramSeriesStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ProgramSeriesDbRow extends Omit<ProgramSeriesRow, 'metadata'> {
  metadata: Record<string, unknown> | null;
}

interface ProgramSeriesItemDbRow extends Omit<ProgramSeriesItemRow, 'metadata'> {
  metadata: Record<string, unknown> | null;
}

const STATUS_SCHEMA = z.enum(['draft', 'published', 'archived']);
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const OPTIONAL_NULLABLE_STRING = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value == null || value === '' ? null : value));

const METADATA_SCHEMA = z
  .record(z.string(), z.unknown())
  .optional()
  .transform((value) => value ?? {});

export const ProgramSeriesCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(96)
    .regex(SLUG_REGEX, 'Slug must be lowercase letters, digits, or dashes.'),
  title: z.string().trim().min(1).max(240),
  subtitle: OPTIONAL_NULLABLE_STRING(300),
  description: OPTIONAL_NULLABLE_STRING(4000),
  category: OPTIONAL_NULLABLE_STRING(80),
  hero_image_url: OPTIONAL_NULLABLE_STRING(1000),
  status: STATUS_SCHEMA.optional().default('draft'),
  display_order: z.number().int().min(0).max(10000).optional(),
  primary_cta_label: OPTIONAL_NULLABLE_STRING(160),
  primary_cta_href: OPTIONAL_NULLABLE_STRING(1000),
  secondary_cta_label: OPTIONAL_NULLABLE_STRING(160),
  secondary_cta_href: OPTIONAL_NULLABLE_STRING(1000),
  metadata: METADATA_SCHEMA,
});

export const ProgramSeriesUpdateSchema = ProgramSeriesCreateSchema.partial().extend({
  slug: z.undefined().optional(),
});

export const ProgramSeriesItemCreateSchema = z.object({
  program_slug: z
    .string()
    .trim()
    .min(1)
    .max(96)
    .regex(SLUG_REGEX, 'Program slug must be lowercase letters, digits, or dashes.'),
  title_override: OPTIONAL_NULLABLE_STRING(240),
  description_override: OPTIONAL_NULLABLE_STRING(4000),
  display_order: z.number().int().min(0).max(10000).optional(),
  status: STATUS_SCHEMA.optional().default('draft'),
  metadata: METADATA_SCHEMA,
});

export const ProgramSeriesItemUpdateSchema =
  ProgramSeriesItemCreateSchema.partial();

export const ProgramSeriesItemsReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1).max(500),
});

export type ProgramSeriesCreateInput = z.infer<
  typeof ProgramSeriesCreateSchema
>;
export type ProgramSeriesUpdateInput = z.infer<
  typeof ProgramSeriesUpdateSchema
>;
export type ProgramSeriesItemCreateInput = z.infer<
  typeof ProgramSeriesItemCreateSchema
>;
export type ProgramSeriesItemUpdateInput = z.infer<
  typeof ProgramSeriesItemUpdateSchema
>;

export function rowToProgramSeries(row: ProgramSeriesDbRow): ProgramSeriesRow {
  return {
    ...row,
    metadata: row.metadata ?? {},
  };
}

export function rowToProgramSeriesItem(
  row: ProgramSeriesItemDbRow,
): ProgramSeriesItemRow {
  return {
    ...row,
    metadata: row.metadata ?? {},
  };
}

export async function listProgramSeries(options: {
  status?: ProgramSeriesStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<{
  rows: ProgramSeriesRow[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);

  let query = supabaseAdmin
    .from('program_series')
    .select('*', { count: 'exact' })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (options.status) query = query.eq('status', options.status);

  const { data, error, count } = await query;
  if (error) throw new Error(`listProgramSeries failed: ${error.message}`);

  return {
    rows: ((data ?? []) as ProgramSeriesDbRow[]).map(rowToProgramSeries),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getProgramSeriesById(
  id: string,
): Promise<ProgramSeriesRow | null> {
  const { data, error } = await supabaseAdmin
    .from('program_series')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getProgramSeriesById failed: ${error.message}`);
  return data ? rowToProgramSeries(data as ProgramSeriesDbRow) : null;
}

async function nextSeriesDisplayOrder(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('program_series')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextSeriesDisplayOrder failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ display_order: number }>;
  return rows.length === 0 ? 0 : rows[0].display_order + 10;
}

async function nextItemDisplayOrder(seriesId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('program_series_items')
    .select('display_order')
    .eq('series_id', seriesId)
    .order('display_order', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextItemDisplayOrder failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ display_order: number }>;
  return rows.length === 0 ? 0 : rows[0].display_order + 1;
}

export async function createProgramSeries(
  input: ProgramSeriesCreateInput,
): Promise<ProgramSeriesRow> {
  const displayOrder = input.display_order ?? (await nextSeriesDisplayOrder());
  const { data, error } = await supabaseAdmin
    .from('program_series')
    .insert({
      slug: input.slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
      hero_image_url: input.hero_image_url ?? null,
      status: input.status,
      display_order: displayOrder,
      primary_cta_label: input.primary_cta_label ?? null,
      primary_cta_href: input.primary_cta_href ?? null,
      secondary_cta_label: input.secondary_cta_label ?? null,
      secondary_cta_href: input.secondary_cta_href ?? null,
      metadata: input.metadata,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createProgramSeries failed: ${error.message}`);
  return rowToProgramSeries(data as ProgramSeriesDbRow);
}

export async function updateProgramSeries(
  id: string,
  input: ProgramSeriesUpdateInput,
): Promise<ProgramSeriesRow> {
  const patch: Partial<ProgramSeriesDbRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle ?? null;
  if (input.description !== undefined)
    patch.description = input.description ?? null;
  if (input.category !== undefined) patch.category = input.category ?? null;
  if (input.hero_image_url !== undefined)
    patch.hero_image_url = input.hero_image_url ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.display_order !== undefined) patch.display_order = input.display_order;
  if (input.primary_cta_label !== undefined)
    patch.primary_cta_label = input.primary_cta_label ?? null;
  if (input.primary_cta_href !== undefined)
    patch.primary_cta_href = input.primary_cta_href ?? null;
  if (input.secondary_cta_label !== undefined)
    patch.secondary_cta_label = input.secondary_cta_label ?? null;
  if (input.secondary_cta_href !== undefined)
    patch.secondary_cta_href = input.secondary_cta_href ?? null;
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {};

  const { data, error } = await supabaseAdmin
    .from('program_series')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateProgramSeries failed: ${error.message}`);
  return rowToProgramSeries(data as ProgramSeriesDbRow);
}

export async function archiveProgramSeries(
  id: string,
): Promise<ProgramSeriesRow> {
  return updateProgramSeries(id, { status: 'archived' });
}

export async function listProgramSeriesItems(
  seriesId: string,
): Promise<ProgramSeriesItemRow[]> {
  const { data, error } = await supabaseAdmin
    .from('program_series_items')
    .select('*')
    .eq('series_id', seriesId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listProgramSeriesItems failed: ${error.message}`);
  return ((data ?? []) as ProgramSeriesItemDbRow[]).map(rowToProgramSeriesItem);
}

export async function addProgramSeriesItem(
  seriesId: string,
  input: ProgramSeriesItemCreateInput,
): Promise<ProgramSeriesItemRow> {
  const displayOrder = input.display_order ?? (await nextItemDisplayOrder(seriesId));
  const { data, error } = await supabaseAdmin
    .from('program_series_items')
    .insert({
      series_id: seriesId,
      program_slug: input.program_slug,
      title_override: input.title_override ?? null,
      description_override: input.description_override ?? null,
      display_order: displayOrder,
      status: input.status,
      metadata: input.metadata,
    })
    .select('*')
    .single();
  if (error) throw new Error(`addProgramSeriesItem failed: ${error.message}`);
  return rowToProgramSeriesItem(data as ProgramSeriesItemDbRow);
}

export async function updateProgramSeriesItem(
  id: string,
  input: ProgramSeriesItemUpdateInput,
): Promise<ProgramSeriesItemRow> {
  const patch: Partial<ProgramSeriesItemDbRow> = {};
  if (input.program_slug !== undefined) patch.program_slug = input.program_slug;
  if (input.title_override !== undefined)
    patch.title_override = input.title_override ?? null;
  if (input.description_override !== undefined)
    patch.description_override = input.description_override ?? null;
  if (input.display_order !== undefined) patch.display_order = input.display_order;
  if (input.status !== undefined) patch.status = input.status;
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {};

  const { data, error } = await supabaseAdmin
    .from('program_series_items')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateProgramSeriesItem failed: ${error.message}`);
  return rowToProgramSeriesItem(data as ProgramSeriesItemDbRow);
}

export async function removeProgramSeriesItem(
  id: string,
): Promise<ProgramSeriesItemRow> {
  return updateProgramSeriesItem(id, { status: 'archived' });
}

export async function reorderProgramSeriesItems(
  seriesId: string,
  orderedIds: string[],
): Promise<ProgramSeriesItemRow[]> {
  const { data, error } = await supabaseAdmin
    .from('program_series_items')
    .select('id')
    .eq('series_id', seriesId);
  if (error) throw new Error(`reorderProgramSeriesItems failed: ${error.message}`);

  const validIds = new Set(
    ((data ?? []) as Array<{ id: string }>).map((row) => row.id),
  );
  const filtered = orderedIds.filter((id) => validIds.has(id));

  for (let i = 0; i < filtered.length; i++) {
    const { error: updateError } = await supabaseAdmin
      .from('program_series_items')
      .update({ display_order: i })
      .eq('id', filtered[i]);
    if (updateError) {
      throw new Error(
        `reorderProgramSeriesItems.update failed: ${updateError.message}`,
      );
    }
  }

  return listProgramSeriesItems(seriesId);
}
