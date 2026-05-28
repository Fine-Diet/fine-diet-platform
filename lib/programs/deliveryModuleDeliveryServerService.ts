/**
 * Program Runtime Packet 16 — delivery module delivery service (server-only).
 *
 * Reads published admin-authored delivery modules and maps them to the generic
 * renderer contract. If no DB modules exist for Baseline, runtime falls back to
 * the code-owned Packet 15 config.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  BASELINE_PREP_DELIVERY_MODULES,
  BASELINE_WEEK_DELIVERY_MODULES,
} from './baselineDeliveryModules';
import {
  PROGRAM_DELIVERY_VISIBILITY_CONDITIONS,
  type ProgramDeliveryBlock,
  type ProgramDeliveryCopy,
  type ProgramDeliveryCta,
  type ProgramDeliveryModuleDefinition,
  type ProgramDeliveryVisibilityCondition,
} from './deliveryModuleTypes';
import { PROGRAM_CAPACITIES, type ProgramCapacity } from './runtimeTypes';
import {
  rowToProgramDeliveryModuleRow,
  type ProgramDeliveryModuleRow,
} from './deliveryModuleAdminServerService';

const BASELINE_SLUG = 'baseline';

interface ProgramRow {
  id: string;
  slug: string;
  status: string;
}

type ProgramDeliveryModuleDbRow = Parameters<
  typeof rowToProgramDeliveryModuleRow
>[0];

export type DeliveryModuleSource = 'admin' | 'baseline_code' | 'none';

export interface DeliveryModulesResult {
  source: DeliveryModuleSource;
  modules: ProgramDeliveryModuleDefinition[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function isVisibilityCondition(
  value: unknown,
): value is ProgramDeliveryVisibilityCondition {
  return (
    typeof value === 'string' &&
    PROGRAM_DELIVERY_VISIBILITY_CONDITIONS.includes(
      value as ProgramDeliveryVisibilityCondition,
    )
  );
}

function parseShowWhen(
  value: unknown,
):
  | ProgramDeliveryVisibilityCondition
  | ProgramDeliveryVisibilityCondition[]
  | undefined {
  if (isVisibilityCondition(value)) return value;
  if (Array.isArray(value) && value.every(isVisibilityCondition)) return value;
  return undefined;
}

function parseCopy(value: unknown): ProgramDeliveryCopy | undefined {
  if (!isRecord(value)) return undefined;
  const copy: ProgramDeliveryCopy = {};
  const eyebrow = optionalString(value.eyebrow);
  const title = optionalString(value.title);
  const body = optionalString(value.body);
  const practice = optionalString(value.practice);
  if (eyebrow) copy.eyebrow = eyebrow;
  if (title) copy.title = title;
  if (body) copy.body = body;
  if (practice) copy.practice = practice;
  return Object.keys(copy).length > 0 ? copy : undefined;
}

function parseCapacityVariants(
  value: unknown,
): Partial<Record<ProgramCapacity, ProgramDeliveryCopy>> | undefined {
  if (!isRecord(value)) return undefined;
  const variants: Partial<Record<ProgramCapacity, ProgramDeliveryCopy>> = {};
  for (const capacity of PROGRAM_CAPACITIES) {
    const copy = parseCopy(value[capacity]);
    if (copy) variants[capacity] = copy;
  }
  return Object.keys(variants).length > 0 ? variants : undefined;
}

function parseCta(value: unknown): ProgramDeliveryCta | undefined {
  if (!isRecord(value)) return undefined;
  const label = optionalString(value.label);
  if (!label) return undefined;

  return {
    label,
    href: optionalString(value.href),
    anchorKey: optionalString(value.anchorKey),
    tone:
      value.tone === 'neutral' ||
      value.tone === 'emerald' ||
      value.tone === 'sky' ||
      value.tone === 'brand' ||
      value.tone === 'muted'
        ? value.tone
        : undefined,
    disabled: optionalBoolean(value.disabled),
    microcopy: optionalString(value.microcopy),
    showWhen: parseShowWhen(value.showWhen),
  };
}

function parseBlocks(value: unknown): ProgramDeliveryBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every(isRecord)
    ? (value as unknown as ProgramDeliveryBlock[])
    : undefined;
}

export function mapDeliveryModuleRowToDefinition(
  row: ProgramDeliveryModuleRow,
  programSlug: string,
): ProgramDeliveryModuleDefinition {
  const anchorId = optionalString(row.anchor_json.anchorId);
  const groupId =
    optionalString(row.metadata.groupId) ?? optionalString(row.anchor_json.groupId);
  const groupTitle =
    optionalString(row.metadata.groupTitle) ??
    optionalString(row.anchor_json.groupTitle);

  return {
    id: row.module_key,
    programSlug,
    moduleType: row.module_type,
    groupId,
    groupTitle,
    title: row.title,
    eyebrow: row.eyebrow ?? undefined,
    body: row.body,
    dayStart: row.day_start ?? undefined,
    dayEnd: row.day_end ?? undefined,
    statusVisibility: row.status_visibility,
    showWhen: parseShowWhen(row.metadata.showWhen),
    statusCopy: isRecord(row.metadata.statusCopy)
      ? (row.metadata.statusCopy as ProgramDeliveryModuleDefinition['statusCopy'])
      : undefined,
    capacityVariants: parseCapacityVariants(row.capacity_variants_json),
    blocks: parseBlocks(row.metadata.blocks),
    cta: parseCta(row.cta_json),
    anchorId,
    safetyNotes: row.safety_notes.length > 0 ? row.safety_notes : undefined,
    noClaimsNotes:
      row.no_claims_notes.length > 0 ? row.no_claims_notes : undefined,
  };
}

export async function getPublishedDeliveryModulesForProgram(
  programSlug: string,
  programVersionId?: string | null,
): Promise<ProgramDeliveryModuleDefinition[]> {
  const trimmed = programSlug.trim().toLowerCase();
  if (!trimmed) return [];

  const { data: programRows, error: programError } = await supabaseAdmin
    .from('programs')
    .select('id, slug, status')
    .eq('slug', trimmed)
    .eq('status', 'published')
    .limit(1);
  if (programError) {
    console.warn(
      '[programs/delivery-modules] programs error:',
      programError.message,
    );
    return [];
  }

  const program = (programRows ?? [])[0] as ProgramRow | undefined;
  if (!program) return [];

  const { data, error } = await supabaseAdmin
    .from('program_delivery_modules')
    .select('*')
    .eq('program_id', program.id)
    .eq('status', 'published')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.warn(
      '[programs/delivery-modules] delivery modules error:',
      error.message,
    );
    return [];
  }

  return ((data ?? []) as ProgramDeliveryModuleDbRow[])
    .map(rowToProgramDeliveryModuleRow)
    .filter((row) => {
      if (programVersionId === undefined) return true;
      return row.program_version_id == null || row.program_version_id === programVersionId;
    })
    .map((row) => mapDeliveryModuleRowToDefinition(row, program.slug));
}

export async function getDeliveryModulesForProgramWithFallback(input: {
  programSlug: string;
  programVersionId?: string | null;
}): Promise<DeliveryModulesResult> {
  const dbModules = await getPublishedDeliveryModulesForProgram(
    input.programSlug,
    input.programVersionId,
  );
  if (dbModules.length > 0) {
    return { source: 'admin', modules: dbModules };
  }

  if (input.programSlug.trim().toLowerCase() === BASELINE_SLUG) {
    return {
      source: 'baseline_code',
      modules: [
        ...BASELINE_PREP_DELIVERY_MODULES,
        ...BASELINE_WEEK_DELIVERY_MODULES,
      ],
    };
  }

  return { source: 'none', modules: [] };
}
