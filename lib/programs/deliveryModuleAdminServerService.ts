/**
 * Program Runtime Packet 16 — delivery module admin service (server-only).
 *
 * CRUD + reorder support for admin-authored Program Delivery Modules. These
 * version-scoped rows are the sole source of member delivery.
 */

import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  PROGRAM_DELIVERY_MODULE_TYPES,
  PROGRAM_DELIVERY_STATUS_VISIBILITIES,
  type ProgramDeliveryModuleType,
  type ProgramDeliveryStatusVisibility,
} from './deliveryModuleTypes';
import {
  compositionIssues,
  evaluateCompositionWrite,
  mergeDeliveryMetadata,
  metadataHasComposition,
  versionBelongsToProgram,
} from './deliveryComposition';
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
    for (const message of compositionIssues({
      metadata: value.metadata,
      programVersionId: value.program_version_id,
      status: value.status,
      dayStart: value.day_start,
      dayEnd: value.day_end,
    })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata'],
        message,
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

async function assertVersionOwnedByProgram(
  programId: string,
  programVersionId: string,
): Promise<{ duration_days: number | null; status: string }> {
  const { data, error } = await supabaseAdmin
    .from('program_versions')
    .select('id, program_id, duration_days, status')
    .eq('id', programVersionId)
    .maybeSingle();
  if (error) {
    throw new Error(`assertVersionOwnedByProgram failed: ${error.message}`);
  }
  const version = data as {
    id: string;
    program_id: string;
    duration_days: number | null;
    status: string;
  } | null;
  const match = versionBelongsToProgram({ programId, version });
  if (!match.ok) {
    const err = new Error(match.message);
    (err as Error & { code?: string }).code = 'VERSION_PROGRAM_MISMATCH';
    throw err;
  }
  return {
    duration_days: version?.duration_days ?? null,
    status: version?.status ?? 'draft',
  };
}

function rejectComposition(message: string): never {
  const err = new Error(message);
  (err as Error & { code?: string }).code = 'COMPOSITION_WRITE_REJECTED';
  throw err;
}

export async function listProgramVersionsForProgram(programId: string): Promise<
  Array<{
    id: string;
    program_id: string;
    version_key: string;
    version_label: string | null;
    version_number: number;
    status: string;
    duration_days: number | null;
  }>
> {
  const { data, error } = await supabaseAdmin
    .from('program_versions')
    .select(
      'id, program_id, version_key, version_label, version_number, status, duration_days',
    )
    .eq('program_id', programId)
    .order('version_number', { ascending: true });
  if (error) {
    throw new Error(`listProgramVersionsForProgram failed: ${error.message}`);
  }
  return (data ?? []) as Array<{
    id: string;
    program_id: string;
    version_key: string;
    version_label: string | null;
    version_number: number;
    status: string;
    duration_days: number | null;
  }>;
}

export async function createDeliveryModule(
  programId: string,
  input: ProgramDeliveryModuleCreateInput,
): Promise<ProgramDeliveryModuleRow> {
  const ownedVersion = input.program_version_id
    ? await assertVersionOwnedByProgram(programId, input.program_version_id)
    : null;
  if (input.program_version_id && ownedVersion?.status !== 'draft') {
    rejectComposition('Published program versions are immutable. Create a new draft version to make changes.');
  }
  const createIssues = compositionIssues({
    metadata: input.metadata,
    programVersionId: input.program_version_id,
    status: input.status,
    dayStart: input.day_start,
    dayEnd: input.day_end,
    durationDays: ownedVersion?.duration_days,
  });
  if (createIssues.length > 0) rejectComposition(createIssues[0]);
  if (
    metadataHasComposition(input.metadata) &&
    ownedVersion?.status !== 'draft'
  ) {
    rejectComposition('Composition content can only be authored on a draft version.');
  }
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
  const existing = await getDeliveryModuleById(id);
  if (!existing) throw new Error('Delivery module not found.');

  const nextMetadata =
    input.metadata !== undefined
      ? mergeDeliveryMetadata(existing.metadata, input.metadata)
      : existing.metadata;
  const nextStatus = input.status ?? existing.status;
  const nextVersionId =
    input.program_version_id !== undefined
      ? input.program_version_id
      : existing.program_version_id;
  const decision = evaluateCompositionWrite({
    existingStatus: existing.status,
    existingVersionId: existing.program_version_id,
    existingMetadata: existing.metadata,
    nextStatus,
    nextVersionId: nextVersionId ?? null,
    nextMetadata,
  });
  if (!decision.ok) {
    const err = new Error(decision.message ?? 'Composition write rejected.');
    (err as Error & { code?: string }).code = decision.code;
    throw err;
  }
  const ownedVersion = nextVersionId
    ? await assertVersionOwnedByProgram(existing.program_id, nextVersionId)
    : null;
  if (existing.program_version_id && ownedVersion?.status !== 'draft') {
    rejectComposition('Published program versions are immutable. Create a new draft version to make changes.');
  }
  const issues = compositionIssues({
    metadata: nextMetadata,
    programVersionId: nextVersionId,
    status: nextStatus,
    dayStart:
      input.day_start !== undefined ? input.day_start : existing.day_start,
    dayEnd: input.day_end !== undefined ? input.day_end : existing.day_end,
    durationDays: ownedVersion?.duration_days,
  });
  if (issues.length > 0) {
    const err = new Error(issues[0]);
    (err as Error & { code?: string }).code = 'COMPOSITION_WRITE_REJECTED';
    throw err;
  }
  if (metadataHasComposition(nextMetadata) && ownedVersion?.status !== 'draft') {
    rejectComposition('Published program versions are immutable. Create a new draft version to make changes.');
  }

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
  if (input.metadata !== undefined) patch.metadata = nextMetadata;

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
  programVersionId: string | null,
): Promise<ProgramDeliveryModuleRow[]> {
  if (programVersionId) {
    const version = await assertVersionOwnedByProgram(programId, programVersionId);
    if (version.status !== 'draft') {
      rejectComposition('Published program versions are immutable. Create a new draft version to reorder content.');
    }
  }
  const { data: existingData, error: existingError } = await supabaseAdmin
    .from('program_delivery_modules')
    .select('id, program_version_id')
    .eq('program_id', programId);
  if (existingError) {
    throw new Error(
      `reorderDeliveryModules.read failed: ${existingError.message}`,
    );
  }

  const rows = (existingData ?? []) as Array<{
    id: string;
    program_version_id: string | null;
  }>;
  const foreign = orderedIds.filter((id) => {
    const row = rows.find((candidate) => candidate.id === id);
    return (
      row != null && (row.program_version_id ?? null) !== programVersionId
    );
  });
  if (foreign.length > 0) {
    const err = new Error(
      'Reorder includes a row from another program version.',
    );
    (err as Error & { code?: string }).code = 'VERSION_SCOPE_MISMATCH';
    throw err;
  }
  const allowed = new Set(
    rows
      .filter((row) => (row.program_version_id ?? null) === programVersionId)
      .map((row) => row.id),
  );
  const filtered = orderedIds.filter((id) => allowed.has(id));

  for (let i = 0; i < filtered.length; i++) {
    const { error } = await supabaseAdmin
      .from('program_delivery_modules')
      .update({ display_order: i })
      .eq('id', filtered[i])
      .eq('program_id', programId);
    if (error) {
      throw new Error(`reorderDeliveryModules.update failed: ${error.message}`);
    }
  }

  return listDeliveryModulesForProgram(programId, programVersionId);
}

export async function listCheckinTemplatesForVersion(
  programId: string,
  programVersionId: string,
): Promise<
  Array<{
    id: string;
    program_version_id: string;
    checkin_day: number;
    title: string;
    description: string | null;
    prompt_md: string | null;
    questions_json: unknown;
    status: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>
> {
  await assertVersionOwnedByProgram(programId, programVersionId);
  const { data, error } = await supabaseAdmin
    .from('program_checkin_templates')
    .select(
      'id, program_version_id, checkin_day, title, description, prompt_md, questions_json, status, metadata, created_at, updated_at',
    )
    .eq('program_version_id', programVersionId)
    .order('checkin_day', { ascending: true });
  if (error) {
    throw new Error(`listCheckinTemplatesForVersion failed: ${error.message}`);
  }
  return (data ?? []) as Array<{
    id: string;
    program_version_id: string;
    checkin_day: number;
    title: string;
    description: string | null;
    prompt_md: string | null;
    questions_json: unknown;
    status: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>;
}

export async function saveCheckinTemplateForDraft(input: {
  programId: string;
  programVersionId: string;
  id?: string | null;
  checkinDay: number;
  title: string;
  description?: string | null;
  promptMd?: string | null;
  questionsJson: unknown;
}): Promise<Record<string, unknown>> {
  const version = await assertVersionOwnedByProgram(input.programId, input.programVersionId);
  if (version.status !== 'draft') rejectComposition('Check-in templates can only be edited on a draft version.');
  if (!version.duration_days || !Number.isInteger(input.checkinDay) || input.checkinDay < 1 || input.checkinDay > version.duration_days) {
    rejectComposition(`Check-in day must be between 1 and ${version.duration_days}.`);
  }
  const title = input.title.trim();
  if (!title || title.length > 240) rejectComposition('Check-in title is required and must be at most 240 characters.');
  if (!Array.isArray(input.questionsJson)) rejectComposition('Check-in questions must be a JSON array.');

  const values = {
    checkin_day: input.checkinDay,
    title,
    description: input.description?.trim() || null,
    prompt_md: input.promptMd?.trim() || null,
    questions_json: input.questionsJson,
    status: 'draft',
  };
  const result = input.id
    ? await supabaseAdmin.from('program_checkin_templates').update(values)
        .eq('id', input.id).eq('program_version_id', input.programVersionId).select('*').single()
    : await supabaseAdmin.from('program_checkin_templates').insert({
        ...values,
        program_version_id: input.programVersionId,
      }).select('*').single();
  if (result.error) {
    if (result.error.code === '23505') rejectComposition('This version already has a check-in on that day.');
    throw new Error(`saveCheckinTemplateForDraft failed: ${result.error.message}`);
  }
  if (!result.data) throw new Error('Check-in template was not saved.');
  return result.data as Record<string, unknown>;
}

export async function createProgramVersionDraft(input: {
  programId: string;
  sourceVersionId?: string | null;
  versionLabel?: string | null;
  durationDays?: number | null;
}): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin.rpc('create_program_version_draft', {
    p_program_id: input.programId,
    p_source_version_id: input.sourceVersionId ?? null,
    p_version_label: input.versionLabel ?? null,
    p_duration_days: input.durationDays ?? null,
  });
  if (error) throw new Error(`createProgramVersionDraft failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error('createProgramVersionDraft returned no version.');
  }
  return row as Record<string, unknown>;
}

export async function publishProgramVersion(input: {
  programId: string;
  programVersionId: string;
}): Promise<Record<string, unknown>> {
  const version = await assertVersionOwnedByProgram(
    input.programId,
    input.programVersionId,
  );
  if (version.status === 'published') {
    const { data, error } = await supabaseAdmin
      .from('program_versions')
      .select('*')
      .eq('id', input.programVersionId)
      .eq('program_id', input.programId)
      .single();
    if (error) throw new Error(`publishProgramVersion read failed: ${error.message}`);
    return data as Record<string, unknown>;
  }
  if (version.status !== 'draft') rejectComposition('Only draft versions can be published.');

  const rows = await listDeliveryModulesForProgram(input.programId, input.programVersionId);
  const invalid = rows.flatMap((row) =>
    compositionIssues({
      metadata: row.metadata,
      programVersionId: row.program_version_id,
      status: row.status,
      dayStart: row.day_start,
      dayEnd: row.day_end,
      durationDays: version.duration_days,
    }),
  );
  if (invalid.length > 0) rejectComposition(invalid[0]);
  if (!rows.some((row) => row.status === 'draft')) {
    rejectComposition('Add at least one draft delivery module before publishing.');
  }

  const { data, error } = await supabaseAdmin.rpc('publish_program_version', {
    p_program_id: input.programId,
    p_program_version_id: input.programVersionId,
  });
  if (error) throw new Error(`publishProgramVersion failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error('publishProgramVersion returned no version.');
  }
  return row as Record<string, unknown>;
}
