/**
 * Plans Phase 12 — Program content admin service (server-only)
 *
 * CRUD + reorder for programs / program_modules / program_content_items.
 * Mirrors the structural conventions used by `programAssignmentServerService`
 * and `programGuidanceAdminServerService`:
 *   - service_role Supabase client
 *   - narrow row → public-type adapters
 *   - explicit ordinal management
 *
 * Only invoked from admin API routes. Do not import from client code.
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
import type {
  ProgramContentItemCreateInput,
  ProgramContentItemUpdateInput,
  ProgramCreateInput,
  ProgramModuleCreateInput,
  ProgramModuleUpdateInput,
  ProgramUpdateInput,
} from './contentValidators';

// ============================================================================
// Row adapters
// ============================================================================

interface ProgramRow {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  storefront_href: string | null;
  status: ProgramStatus;
  metadata: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProgramModuleRow {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  ordinal: number;
  status: ProgramStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ProgramContentItemRow {
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
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function rowToProgram(r: ProgramRow): Program {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    tagline: r.tagline,
    description: r.description,
    storefront_href: r.storefront_href,
    status: r.status,
    metadata: r.metadata ?? {},
    created_by_user_id: r.created_by_user_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToModule(r: ProgramModuleRow): ProgramModule {
  return {
    id: r.id,
    program_id: r.program_id,
    title: r.title,
    description: r.description,
    ordinal: r.ordinal,
    status: r.status,
    metadata: r.metadata ?? {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToItem(r: ProgramContentItemRow): ProgramContentItem {
  return {
    id: r.id,
    module_id: r.module_id,
    item_type: r.item_type,
    title: r.title,
    summary: r.summary,
    body: r.body,
    video_url: r.video_url,
    video_provider: r.video_provider,
    estimated_minutes: r.estimated_minutes,
    ordinal: r.ordinal,
    status: r.status,
    metadata: r.metadata ?? {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ============================================================================
// Programs
// ============================================================================

export interface ListProgramsOptions {
  status?: ProgramStatus;
  limit?: number;
  offset?: number;
}

export async function listPrograms(
  options: ListProgramsOptions = {},
): Promise<{ rows: Program[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);

  let q = supabaseAdmin
    .from('programs')
    .select('*', { count: 'exact' })
    .order('title', { ascending: true })
    .range(offset, offset + limit - 1);
  if (options.status) q = q.eq('status', options.status);

  const { data, error, count } = await q;
  if (error) throw new Error(`listPrograms failed: ${error.message}`);
  return {
    rows: ((data ?? []) as ProgramRow[]).map(rowToProgram),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getProgramById(id: string): Promise<Program | null> {
  const { data, error } = await supabaseAdmin
    .from('programs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getProgramById failed: ${error.message}`);
  return data ? rowToProgram(data as ProgramRow) : null;
}

export async function getProgramBySlug(slug: string): Promise<Program | null> {
  const { data, error } = await supabaseAdmin
    .from('programs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`getProgramBySlug failed: ${error.message}`);
  return data ? rowToProgram(data as ProgramRow) : null;
}

export async function createProgram(
  input: ProgramCreateInput,
  ctx: { createdByAuthUserId?: string | null } = {},
): Promise<Program> {
  const { data, error } = await supabaseAdmin
    .from('programs')
    .insert({
      slug: input.slug,
      title: input.title,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      storefront_href: input.storefront_href ?? null,
      status: input.status ?? 'draft',
      metadata: input.metadata ?? {},
      created_by_user_id: ctx.createdByAuthUserId ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createProgram failed: ${error.message}`);
  return rowToProgram(data as ProgramRow);
}

export async function updateProgram(
  id: string,
  input: ProgramUpdateInput,
): Promise<Program> {
  const patch: Partial<ProgramRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.tagline !== undefined) patch.tagline = input.tagline ?? null;
  if (input.description !== undefined)
    patch.description = input.description ?? null;
  if (input.storefront_href !== undefined)
    patch.storefront_href = input.storefront_href ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {};

  const { data, error } = await supabaseAdmin
    .from('programs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateProgram failed: ${error.message}`);
  return rowToProgram(data as ProgramRow);
}

export async function deleteProgram(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('programs')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`deleteProgram failed: ${error.message}`);
}

// ============================================================================
// Modules
// ============================================================================

export async function listModulesForProgram(
  programId: string,
): Promise<ProgramModule[]> {
  const { data, error } = await supabaseAdmin
    .from('program_modules')
    .select('*')
    .eq('program_id', programId)
    .order('ordinal', { ascending: true });
  if (error) throw new Error(`listModulesForProgram failed: ${error.message}`);
  return ((data ?? []) as ProgramModuleRow[]).map(rowToModule);
}

export async function getModuleById(id: string): Promise<ProgramModule | null> {
  const { data, error } = await supabaseAdmin
    .from('program_modules')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getModuleById failed: ${error.message}`);
  return data ? rowToModule(data as ProgramModuleRow) : null;
}

async function nextOrdinalForProgram(programId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('program_modules')
    .select('ordinal')
    .eq('program_id', programId)
    .order('ordinal', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextOrdinalForProgram failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ ordinal: number }>;
  return rows.length === 0 ? 0 : rows[0].ordinal + 1;
}

export async function createModule(
  programId: string,
  input: ProgramModuleCreateInput,
): Promise<ProgramModule> {
  const ordinal =
    input.ordinal ?? (await nextOrdinalForProgram(programId));
  const { data, error } = await supabaseAdmin
    .from('program_modules')
    .insert({
      program_id: programId,
      title: input.title,
      description: input.description ?? null,
      ordinal,
      status: input.status ?? 'draft',
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error) throw new Error(`createModule failed: ${error.message}`);
  return rowToModule(data as ProgramModuleRow);
}

export async function updateModule(
  id: string,
  input: ProgramModuleUpdateInput,
): Promise<ProgramModule> {
  const patch: Partial<ProgramModuleRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined)
    patch.description = input.description ?? null;
  if (input.ordinal !== undefined) patch.ordinal = input.ordinal;
  if (input.status !== undefined) patch.status = input.status;
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {};

  const { data, error } = await supabaseAdmin
    .from('program_modules')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateModule failed: ${error.message}`);
  return rowToModule(data as ProgramModuleRow);
}

export async function deleteModule(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('program_modules')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`deleteModule failed: ${error.message}`);
}

/**
 * Rewrite module ordinals 0..n-1 for a program. Ids not in the current
 * module set for that program are ignored.
 */
export async function reorderModules(
  programId: string,
  orderedIds: string[],
): Promise<ProgramModule[]> {
  const { data: existingData, error: existingError } = await supabaseAdmin
    .from('program_modules')
    .select('id')
    .eq('program_id', programId);
  if (existingError) {
    throw new Error(`reorderModules.read failed: ${existingError.message}`);
  }
  const validIds = new Set(
    ((existingData ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
  const filtered = orderedIds.filter((id) => validIds.has(id));

  for (let i = 0; i < filtered.length; i++) {
    const { error } = await supabaseAdmin
      .from('program_modules')
      .update({ ordinal: i })
      .eq('id', filtered[i]);
    if (error) {
      throw new Error(`reorderModules.update failed: ${error.message}`);
    }
  }
  return listModulesForProgram(programId);
}

// ============================================================================
// Content items
// ============================================================================

export async function listItemsForModule(
  moduleId: string,
): Promise<ProgramContentItem[]> {
  const { data, error } = await supabaseAdmin
    .from('program_content_items')
    .select('*')
    .eq('module_id', moduleId)
    .order('ordinal', { ascending: true });
  if (error) throw new Error(`listItemsForModule failed: ${error.message}`);
  return ((data ?? []) as ProgramContentItemRow[]).map(rowToItem);
}

export async function getItemById(
  id: string,
): Promise<ProgramContentItem | null> {
  const { data, error } = await supabaseAdmin
    .from('program_content_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getItemById failed: ${error.message}`);
  return data ? rowToItem(data as ProgramContentItemRow) : null;
}

async function nextOrdinalForModule(moduleId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('program_content_items')
    .select('ordinal')
    .eq('module_id', moduleId)
    .order('ordinal', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextOrdinalForModule failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ ordinal: number }>;
  return rows.length === 0 ? 0 : rows[0].ordinal + 1;
}

export async function createItem(
  moduleId: string,
  input: ProgramContentItemCreateInput,
): Promise<ProgramContentItem> {
  const ordinal =
    input.ordinal ?? (await nextOrdinalForModule(moduleId));
  const { data, error } = await supabaseAdmin
    .from('program_content_items')
    .insert({
      module_id: moduleId,
      item_type: input.item_type,
      title: input.title,
      summary: input.summary ?? null,
      body: input.body ?? null,
      video_url: input.video_url ?? null,
      video_provider: input.video_provider ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      ordinal,
      status: input.status ?? 'draft',
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error) throw new Error(`createItem failed: ${error.message}`);
  return rowToItem(data as ProgramContentItemRow);
}

export async function updateItem(
  id: string,
  input: ProgramContentItemUpdateInput,
): Promise<ProgramContentItem> {
  const patch: Partial<ProgramContentItemRow> = {};
  if (input.item_type !== undefined) patch.item_type = input.item_type;
  if (input.title !== undefined) patch.title = input.title;
  if (input.summary !== undefined) patch.summary = input.summary ?? null;
  if (input.body !== undefined) patch.body = input.body ?? null;
  if (input.video_url !== undefined)
    patch.video_url = input.video_url ?? null;
  if (input.video_provider !== undefined)
    patch.video_provider = input.video_provider ?? null;
  if (input.estimated_minutes !== undefined)
    patch.estimated_minutes = input.estimated_minutes ?? null;
  if (input.ordinal !== undefined) patch.ordinal = input.ordinal;
  if (input.status !== undefined) patch.status = input.status;
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {};

  const { data, error } = await supabaseAdmin
    .from('program_content_items')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateItem failed: ${error.message}`);
  return rowToItem(data as ProgramContentItemRow);
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('program_content_items')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`deleteItem failed: ${error.message}`);
}

export async function reorderItems(
  moduleId: string,
  orderedIds: string[],
): Promise<ProgramContentItem[]> {
  const { data: existingData, error: existingError } = await supabaseAdmin
    .from('program_content_items')
    .select('id')
    .eq('module_id', moduleId);
  if (existingError) {
    throw new Error(`reorderItems.read failed: ${existingError.message}`);
  }
  const validIds = new Set(
    ((existingData ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
  const filtered = orderedIds.filter((id) => validIds.has(id));

  for (let i = 0; i < filtered.length; i++) {
    const { error } = await supabaseAdmin
      .from('program_content_items')
      .update({ ordinal: i })
      .eq('id', filtered[i]);
    if (error) {
      throw new Error(`reorderItems.update failed: ${error.message}`);
    }
  }
  return listItemsForModule(moduleId);
}

// ============================================================================
// Trees
// ============================================================================

/**
 * Admin-scope tree: all modules + items for a program regardless of
 * status. User-facing delivery uses `getPublishedProgramTreeBySlug`
 * from the delivery service so drafts never leak.
 */
export async function getAdminProgramTreeById(
  programId: string,
): Promise<ProgramWithTree | null> {
  const program = await getProgramById(programId);
  if (!program) return null;
  const modules = await listModulesForProgram(programId);

  const moduleIds = modules.map((m) => m.id);
  if (moduleIds.length === 0) {
    return { program, modules: [] };
  }

  const { data, error } = await supabaseAdmin
    .from('program_content_items')
    .select('*')
    .in('module_id', moduleIds)
    .order('ordinal', { ascending: true });
  if (error) {
    throw new Error(`getAdminProgramTreeById.items failed: ${error.message}`);
  }
  const allItems = ((data ?? []) as ProgramContentItemRow[]).map(rowToItem);
  const byModule = new Map<string, ProgramContentItem[]>();
  for (const item of allItems) {
    const list = byModule.get(item.module_id) ?? [];
    list.push(item);
    byModule.set(item.module_id, list);
  }

  return {
    program,
    modules: modules.map((module) => ({
      module,
      items: byModule.get(module.id) ?? [],
    })),
  };
}
