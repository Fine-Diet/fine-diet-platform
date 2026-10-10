/**
 * Program Runtime Packet 16 — delivery module delivery service (server-only).
 *
 * Reads published admin-authored delivery modules and maps them to the generic
 * renderer contract. Member reads are scoped to an authorized version; an empty
 * database result remains empty.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
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
  definitionFromDeliveryFields,
  parseMediaBlock,
} from './deliveryComposition';
import {
  rowToProgramDeliveryModuleRow,
  type ProgramDeliveryModuleRow,
} from './deliveryModuleAdminServerService';
import { getCodeDeliveryModuleSet } from './deliveryModuleSetRegistry';

interface ProgramRow {
  id: string;
  slug: string;
  status: string;
}

type ProgramDeliveryModuleDbRow = Parameters<
  typeof rowToProgramDeliveryModuleRow
>[0];

export type DeliveryModuleSource =
  | 'admin'
  | 'baseline_code'
  | 'code'
  | 'none';

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
  if (!value.every(isRecord)) return undefined;
  const blocks: ProgramDeliveryBlock[] = [];
  for (const entry of value) {
    if (entry.type === 'audio' || entry.type === 'video') {
      const parsed = parseMediaBlock(entry);
      if ('block' in parsed) blocks.push(parsed.block);
      continue;
    }
    blocks.push(entry as unknown as ProgramDeliveryBlock);
  }
  return blocks;
}

export function mapDeliveryModuleRowToDefinition(
  row: ProgramDeliveryModuleRow,
  programSlug: string,
): ProgramDeliveryModuleDefinition {
  return definitionFromDeliveryFields({
    programSlug,
    moduleKey: row.module_key,
    moduleType: row.module_type,
    title: row.title,
    eyebrow: row.eyebrow,
    body: row.body,
    dayStart: row.day_start,
    dayEnd: row.day_end,
    statusVisibility: row.status_visibility,
    metadata: row.metadata,
    capacityVariants: row.capacity_variants_json,
    cta: row.cta_json,
    anchor: row.anchor_json,
    safetyNotes: row.safety_notes,
    noClaimsNotes: row.no_claims_notes,
  }).definition;
}

export async function getPublishedDeliveryModulesForProgram(
  programSlug: string,
  programVersionId: string,
): Promise<{ modules: ProgramDeliveryModuleDefinition[]; versionKey: string | null }> {
  const trimmed = programSlug.trim().toLowerCase();
  if (!trimmed || !programVersionId) return { modules: [], versionKey: null };

  const { data: programRows, error: programError } = await supabaseAdmin
    .from('programs')
    .select('id, slug, status')
    .eq('slug', trimmed)
    .eq('status', 'published')
    .limit(1);
  if (programError) {
    throw new Error(`program lookup failed: ${programError.message}`);
  }

  const program = (programRows ?? [])[0] as ProgramRow | undefined;
  if (!program) return { modules: [], versionKey: null };

  const { data: versionRows, error: versionError } = await supabaseAdmin
    .from('program_versions')
    .select('id, program_id, version_key, status')
    .eq('id', programVersionId)
    .eq('program_id', program.id)
    .limit(1);
  if (versionError) {
    throw new Error(`program version lookup failed: ${versionError.message}`);
  }
  const version = (versionRows ?? [])[0] as
    | { id: string; program_id: string; version_key: string; status: string }
    | undefined;
  if (!version || version.status !== 'published') {
    return { modules: [], versionKey: null };
  }

  const { data, error } = await supabaseAdmin
    .from('program_delivery_modules')
    .select('*')
    .eq('program_id', program.id)
    .eq('program_version_id', programVersionId)
    .eq('status', 'published')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`delivery modules lookup failed: ${error.message}`);
  }

  const modules = ((data ?? []) as ProgramDeliveryModuleDbRow[])
    .map(rowToProgramDeliveryModuleRow)
    .filter((row) => row.program_version_id === programVersionId)
    .map((row) => mapDeliveryModuleRowToDefinition(row, program.slug));
  return { modules, versionKey: version.version_key };
}

export async function getDeliveryModulesForProgramWithFallback(input: {
  programSlug: string;
  programVersionId: string;
}): Promise<DeliveryModulesResult> {
  const { modules: dbModules, versionKey } = await getPublishedDeliveryModulesForProgram(
    input.programSlug,
    input.programVersionId,
  );
  if (dbModules.length > 0) {
    return { source: 'admin', modules: dbModules };
  }
  // The seeded Baseline v1 experience predates DB-authored delivery rows.
  // Preserve it only for its exact immutable version key. Never apply it to a
  // newer version or after a database read error.
  const codeSet = versionKey
    ? getCodeDeliveryModuleSet(input.programSlug, versionKey)
    : null;
  if (codeSet) return { source: codeSet.source, modules: codeSet.modules };
  return { source: 'none', modules: [] };
}
