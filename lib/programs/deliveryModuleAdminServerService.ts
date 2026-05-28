/**
 * Program Runtime Packet 16 — delivery module admin service (server-only).
 *
 * CRUD + reorder support for admin-authored Program Delivery Modules. These
 * rows are additive; code-owned Baseline modules remain the runtime fallback.
 */

import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  PROGRAM_DELIVERY_MODULE_TYPES,
  PROGRAM_DELIVERY_STATUS_VISIBILITIES,
  type ProgramDeliveryModuleType,
  type ProgramDeliveryStatusVisibility,
} from './deliveryModuleTypes';
import type { ProgramStatus } from './contentTypes';

export type ProgramDeliveryModuleStatus = ProgramStatus;

export interface ProgramDeliveryModuleRow {
  id: string;
  program_id: string;
  program_version_id: string | null;
  module_key: string;
  module_type: ProgramDeliveryModuleType;
  title: string;
  eyebrow: string | null;
  body: string;
  day_start: number | null;
  day_end: number | null;
  status_visibility: ProgramDeliveryStatusVisibility[];
  capacity_variants_json: Record<string, unknown>;
  cta_json: Record<string, unknown>;
  anchor_json: Record<string, unknown>;
  display_order: number;
  status: ProgramDeliveryModuleStatus;
  safety_notes: string[];
  no_claims_notes: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ProgramDeliveryModuleDbRow
  extends Omit<
    ProgramDeliveryModuleRow,
    | 'capacity_variants_json'
    | 'cta_json'
    | 'anchor_json'
    | 'metadata'
    | 'safety_notes'
    | 'no_claims_notes'
    | 'status_visibility'
  > {
  capacity_variants_json: Record<string, unknown> | null;
  cta_json: Record<string, unknown> | null;
  anchor_json: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  safety_notes: string[] | null;
  no_claims_notes: string[] | null;
  status_visibility: ProgramDeliveryStatusVisibility[] | null;
}

const MODULE_KEY_REGEX = /^[a-z0-9][a-z0-9-_]*$/;

const STATUS_SCHEMA = z.enum(['draft', 'published', 'archived']);
const MODULE_TYPE_SCHEMA = z.enum(PROGRAM_DELIVERY_MODULE_TYPES);
const STATUS_VISIBILITY_SCHEMA = z.enum(PROGRAM_DELIVERY_STATUS_VISIBILITIES);
const JSON_OBJECT_SCHEMA = z
  .record(z.string(), z.unknown())
  .optional()
  .transform((value) => value ?? {});
const OPTIONAL_NULLABLE_STRING = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value == null || value === '' ? null : value));
const NOTES_SCHEMA = z
  .array(z.string().trim().min(1).max(500))
  .max(50)
  .optional()
  .transform((value) => value ?? []);

const DeliveryModuleBaseSchema = z
  .object({
    program_version_id: z.string().uuid().optional().nullable(),
    module_key: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(
        MODULE_KEY_REGEX,
        'module_key must use lowercase letters, digits, hyphens, or underscores.',
      ),
    module_type: MODULE_TYPE_SCHEMA,
    title: z.string().trim().min(1).max(240),
    eyebrow: OPTIONAL_NULLABLE_STRING(160),
    body: z.string().trim().min(1).max(20000),
    day_start: z.number().int().min(0).max(10000).optional().nullable(),
    day_end: z.number().int().min(0).max(10000).optional().nullable(),
    status_visibility: z
      .array(STATUS_VISIBILITY_SCHEMA)
      .min(1)
      .max(10)
      .optional()
      .default(['pre_start', 'active']),
    capacity_variants_json: JSON_OBJECT_SCHEMA,
    cta_json: JSON_OBJECT_SCHEMA,
    anchor_json: JSON_OBJECT_SCHEMA,
    display_order: z.number().int().min(0).max(10000).optional(),
    status: STATUS_SCHEMA.optional().default('draft'),
    safety_notes: NOTES_SCHEMA,
    no_claims_notes: NOTES_SCHEMA,
    metadata: JSON_OBJECT_SCHEMA,
  })
  .superRefine((value, ctx) => {
    if (
      value.day_start != null &&
      value.day_end != null &&
      value.day_start > value.day_end
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['day_end'],
        message: 'day_end must be greater than or equal to day_start.',
      });
    }
  });

export const ProgramDeliveryModuleCreateSchema = DeliveryModuleBaseSchema;
export const ProgramDeliveryModuleUpdateSchema = z
  .object({
    program_version_id: z.string().uuid().optional().nullable(),
    module_key: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(
        MODULE_KEY_REGEX,
        'module_key must use lowercase letters, digits, hyphens, or underscores.',
      )
      .optional(),
    module_type: MODULE_TYPE_SCHEMA.optional(),
    title: z.string().trim().min(1).max(240).optional(),
    eyebrow: z.string().trim().max(160).nullable().optional(),
    body: z.string().trim().min(1).max(20000).optional(),
    day_start: z.number().int().min(0).max(10000).optional().nullable(),
    day_end: z.number().int().min(0).max(10000).optional().nullable(),
    status_visibility: z
      .array(STATUS_VISIBILITY_SCHEMA)
      .min(1)
      .max(10)
      .optional(),
    capacity_variants_json: z.record(z.string(), z.unknown()).optional(),
    cta_json: z.record(z.string(), z.unknown()).optional(),
    anchor_json: z.record(z.string(), z.unknown()).optional(),
    display_order: z.number().int().min(0).max(10000).optional(),
    status: STATUS_SCHEMA.optional(),
    safety_notes: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    no_claims_notes: z
      .array(z.string().trim().min(1).max(500))
      .max(50)
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.day_start != null &&
      value.day_end != null &&
      value.day_start > value.day_end
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['day_end'],
        message: 'day_end must be greater than or equal to day_start.',
      });
    }
  });

export type ProgramDeliveryModuleCreateInput = z.infer<
  typeof ProgramDeliveryModuleCreateSchema
>;
export type ProgramDeliveryModuleUpdateInput = z.infer<
  typeof ProgramDeliveryModuleUpdateSchema
>;

export function rowToProgramDeliveryModuleRow(
  row: ProgramDeliveryModuleDbRow,
): ProgramDeliveryModuleRow {
  return {
    ...row,
    status_visibility: row.status_visibility ?? ['pre_start', 'active'],
    capacity_variants_json: row.capacity_variants_json ?? {},
    cta_json: row.cta_json ?? {},
    anchor_json: row.anchor_json ?? {},
    safety_notes: row.safety_notes ?? [],
    no_claims_notes: row.no_claims_notes ?? [],
    metadata: row.metadata ?? {},
  };
}

async function nextDisplayOrder(
  programId: string,
  programVersionId: string | null | undefined,
): Promise<number> {
  let query = supabaseAdmin
    .from('program_delivery_modules')
    .select('display_order')
    .eq('program_id', programId)
    .order('display_order', { ascending: false })
    .limit(1);

  query =
    programVersionId == null
      ? query.is('program_version_id', null)
      : query.eq('program_version_id', programVersionId);

  const { data, error } = await query;
  if (error) throw new Error(`nextDisplayOrder failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ display_order: number }>;
  return rows.length === 0 ? 0 : rows[0].display_order + 1;
}

export async function listDeliveryModulesForProgram(
  programId: string,
  programVersionId?: string | null,
): Promise<ProgramDeliveryModuleRow[]> {
  let query = supabaseAdmin
    .from('program_delivery_modules')
    .select('*')
    .eq('program_id', programId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (programVersionId !== undefined) {
    query =
      programVersionId == null
        ? query.is('program_version_id', null)
        : query.eq('program_version_id', programVersionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`listDeliveryModulesForProgram failed: ${error.message}`);
  }
  return ((data ?? []) as ProgramDeliveryModuleDbRow[]).map(
    rowToProgramDeliveryModuleRow,
  );
}

export async function getDeliveryModuleById(
  id: string,
): Promise<ProgramDeliveryModuleRow | null> {
  const { data, error } = await supabaseAdmin
    .from('program_delivery_modules')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDeliveryModuleById failed: ${error.message}`);
  return data
    ? rowToProgramDeliveryModuleRow(data as ProgramDeliveryModuleDbRow)
    : null;
}

export async function createDeliveryModule(
  programId: string,
  input: ProgramDeliveryModuleCreateInput,
): Promise<ProgramDeliveryModuleRow> {
  const displayOrder =
    input.display_order ??
    (await nextDisplayOrder(programId, input.program_version_id));
  const { data, error } = await supabaseAdmin
    .from('program_delivery_modules')
    .insert({
      program_id: programId,
      program_version_id: input.program_version_id ?? null,
      module_key: input.module_key,
      module_type: input.module_type,
      title: input.title,
      eyebrow: input.eyebrow ?? null,
      body: input.body,
      day_start: input.day_start ?? null,
      day_end: input.day_end ?? null,
      status_visibility: input.status_visibility,
      capacity_variants_json: input.capacity_variants_json,
      cta_json: input.cta_json,
      anchor_json: input.anchor_json,
      display_order: displayOrder,
      status: input.status,
      safety_notes: input.safety_notes,
      no_claims_notes: input.no_claims_notes,
      metadata: input.metadata,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createDeliveryModule failed: ${error.message}`);
  return rowToProgramDeliveryModuleRow(data as ProgramDeliveryModuleDbRow);
}

export async function updateDeliveryModule(
  id: string,
  input: ProgramDeliveryModuleUpdateInput,
): Promise<ProgramDeliveryModuleRow> {
  const patch: Partial<ProgramDeliveryModuleDbRow> = {};
  if (input.program_version_id !== undefined) {
    patch.program_version_id = input.program_version_id ?? null;
  }
  if (input.module_key !== undefined) patch.module_key = input.module_key;
  if (input.module_type !== undefined) patch.module_type = input.module_type;
  if (input.title !== undefined) patch.title = input.title;
  if (input.eyebrow !== undefined) patch.eyebrow = input.eyebrow ?? null;
  if (input.body !== undefined) patch.body = input.body;
  if (input.day_start !== undefined) patch.day_start = input.day_start ?? null;
  if (input.day_end !== undefined) patch.day_end = input.day_end ?? null;
  if (input.status_visibility !== undefined) {
    patch.status_visibility = input.status_visibility;
  }
  if (input.capacity_variants_json !== undefined) {
    patch.capacity_variants_json = input.capacity_variants_json;
  }
  if (input.cta_json !== undefined) patch.cta_json = input.cta_json;
  if (input.anchor_json !== undefined) patch.anchor_json = input.anchor_json;
  if (input.display_order !== undefined) patch.display_order = input.display_order;
  if (input.status !== undefined) patch.status = input.status;
  if (input.safety_notes !== undefined) patch.safety_notes = input.safety_notes;
  if (input.no_claims_notes !== undefined)
    patch.no_claims_notes = input.no_claims_notes;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const { data, error } = await supabaseAdmin
    .from('program_delivery_modules')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateDeliveryModule failed: ${error.message}`);
  return rowToProgramDeliveryModuleRow(data as ProgramDeliveryModuleDbRow);
}

export async function archiveDeliveryModule(
  id: string,
): Promise<ProgramDeliveryModuleRow> {
  return updateDeliveryModule(id, { status: 'archived' });
}

export async function reorderDeliveryModules(
  programId: string,
  orderedIds: string[],
): Promise<ProgramDeliveryModuleRow[]> {
  const { data: existingData, error: existingError } = await supabaseAdmin
    .from('program_delivery_modules')
    .select('id')
    .eq('program_id', programId);
  if (existingError) {
    throw new Error(
      `reorderDeliveryModules.read failed: ${existingError.message}`,
    );
  }

  const validIds = new Set(
    ((existingData ?? []) as Array<{ id: string }>).map((row) => row.id),
  );
  const filtered = orderedIds.filter((id) => validIds.has(id));

  for (let i = 0; i < filtered.length; i++) {
    const { error } = await supabaseAdmin
      .from('program_delivery_modules')
      .update({ display_order: i })
      .eq('id', filtered[i]);
    if (error) {
      throw new Error(`reorderDeliveryModules.update failed: ${error.message}`);
    }
  }

  return listDeliveryModulesForProgram(programId);
}
