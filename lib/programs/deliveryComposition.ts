/**
 * Client-safe Programs composition contract.
 *
 * Audio and video are blocks inside existing module types. Order is
 * display_order plus block-array order. This module does not import a
 * database client and does not publish rows.
 */

import {
  isDeliveryModuleVisible,
  PROGRAM_DELIVERY_STATUS_VISIBILITIES,
  PROGRAM_DELIVERY_VISIBILITY_CONDITIONS,
  type ProgramDeliveryBlock,
  type ProgramDeliveryCopy,
  type ProgramDeliveryCta,
  type ProgramDeliveryMediaBlock,
  type ProgramDeliveryModuleDefinition,
  type ProgramDeliveryModuleType,
  type ProgramDeliveryRuntimeContext,
  type ProgramDeliveryStatusVisibility,
  type ProgramDeliveryVisibilityCondition,
} from './deliveryModuleTypes';
import {
  PROGRAM_CAPACITIES,
  type ProgramCapacity,
  type ProgramCheckinTemplate,
  type ProgramRuntimeSummary,
} from './runtimeTypes';

export const DELIVERY_COMPOSITION_CONTRACT =
  'programs-delivery-composition-v1' as const;

export const PROGRAM_PREVIEW_TEST_AUDIO_PATH = '/audio/Test-Print-For-FD.mp3';

export type DeliveryCompositionSource =
  | 'unsaved'
  | 'saved-draft'
  | 'published'
  | 'fixture'
  | 'delivery';

export interface DeliveryCompositionHero {
  title?: string;
  eyebrow?: string;
  imageUrl?: string;
}

export interface DeliveryCompositionMarker {
  contract: typeof DELIVERY_COMPOSITION_CONTRACT;
  hero?: DeliveryCompositionHero;
}

const BLOCK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,80}$/;

export function isSafeMediaReference(value: string): boolean {
  const url = value.trim();
  if (!url || url.length > 2000) return false;
  if (/[\s]/.test(url)) return false;
  if (/^(javascript|data|vbscript):/i.test(url)) return false;
  if (url.startsWith('//')) return false;
  if (url.startsWith('/')) return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function metadataHasComposition(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const composition = metadata.composition;
  if (!composition || typeof composition !== 'object' || Array.isArray(composition)) {
    return false;
  }
  return (
    (composition as { contract?: unknown }).contract ===
    DELIVERY_COMPOSITION_CONTRACT
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

export function readCompositionHero(
  metadata: Record<string, unknown> | null | undefined,
): DeliveryCompositionHero | undefined {
  if (!isRecord(metadata?.hero)) return undefined;
  const hero = metadata.hero;
  const title = optionalText(hero.title, 240);
  const eyebrow = optionalText(hero.eyebrow, 160);
  const imageUrl =
    typeof hero.imageUrl === 'string' && isSafeMediaReference(hero.imageUrl)
      ? hero.imageUrl.trim()
      : undefined;
  if (!title && !eyebrow && !imageUrl) return undefined;
  return { title, eyebrow, imageUrl };
}

export function parseMediaBlock(
  value: unknown,
): { block: ProgramDeliveryMediaBlock } | { error: string } {
  if (!isRecord(value)) return { error: 'Media block must be an object.' };
  if (value.type !== 'audio' && value.type !== 'video') {
    return { error: 'Media block type must be audio or video.' };
  }
  if (typeof value.id !== 'string' || !BLOCK_ID_PATTERN.test(value.id)) {
    return { error: 'Media block id must be a stable lowercase key.' };
  }
  if (typeof value.url !== 'string' || !isSafeMediaReference(value.url)) {
    return { error: 'Media block url must be a site path or https URL.' };
  }
  if (value.url.trim() === PROGRAM_PREVIEW_TEST_AUDIO_PATH) {
    return {
      error:
        'The test audio file cannot be saved as authored program media.',
    };
  }
  const title = optionalText(value.title, 240);
  if (!title) return { error: 'Media block title is required.' };
  const description = optionalText(value.description, 2000);
  return {
    block: {
      type: value.type,
      id: value.id,
      url: value.url.trim(),
      title,
      description,
    },
  };
}

const MAX_COMPOSITION_BLOCKS = 24;
const MAX_COMPOSITION_ITEMS = 40;
const MAX_COMPOSITION_TEXT = 4000;
const METRIC_KEYS = new Set([
  'selected_start',
  'current_day',
  'capacity',
  'content_progress',
]);

function textIssue(
  value: unknown,
  label: string,
  max: number,
  issues: string[],
  required = false,
): void {
  if (value == null || value === '') {
    if (required) issues.push(`${label} is required.`);
    return;
  }
  if (typeof value !== 'string') {
    issues.push(`${label} must be text.`);
    return;
  }
  if (value.trim().length > max) {
    issues.push(`${label} exceeds ${max} characters.`);
  }
}

function validateCompositionBlock(
  block: Record<string, unknown>,
  issues: string[],
  seenMedia: Set<string>,
): void {
  if (block.type === 'audio' || block.type === 'video') {
    const parsed = parseMediaBlock(block);
    if ('error' in parsed) issues.push(parsed.error);
    else if (seenMedia.has(parsed.block.id)) {
      issues.push(`Duplicate media block id ${parsed.block.id}.`);
    } else seenMedia.add(parsed.block.id);
    return;
  }
  if (block.type === 'metrics') {
    if (
      !Array.isArray(block.metrics) ||
      block.metrics.length === 0 ||
      block.metrics.length > MAX_COMPOSITION_ITEMS ||
      block.metrics.some((item) => typeof item !== 'string' || !METRIC_KEYS.has(item))
    ) {
      issues.push(
        'Metrics block requires a bounded list of supported metric keys.',
      );
    }
    return;
  }
  if (block.type === 'list') {
    if (
      !Array.isArray(block.items) ||
      block.items.length === 0 ||
      block.items.length > MAX_COMPOSITION_ITEMS
    ) {
      issues.push('List block requires a bounded items array.');
      return;
    }
    block.items.forEach((item, index) => {
      textIssue(item, `List item ${index + 1}`, MAX_COMPOSITION_TEXT, issues, true);
    });
    return;
  }
  if (block.type === 'cards') {
    if (
      !Array.isArray(block.cards) ||
      block.cards.length === 0 ||
      block.cards.length > MAX_COMPOSITION_ITEMS
    ) {
      issues.push('Cards block requires a bounded cards array.');
      return;
    }
    block.cards.forEach((card, index) => {
      if (!isRecord(card)) {
        issues.push(`Card ${index + 1} must be an object.`);
        return;
      }
      textIssue(card.title, `Card ${index + 1} title`, 240, issues, true);
      textIssue(card.body, `Card ${index + 1} body`, MAX_COMPOSITION_TEXT, issues, true);
    });
    return;
  }
  if (block.type === 'notice') {
    textIssue(block.eyebrow, 'Notice eyebrow', 160, issues);
    textIssue(block.title, 'Notice title', 240, issues, true);
    textIssue(block.body, 'Notice body', MAX_COMPOSITION_TEXT, issues, true);
    if (
      block.tone != null &&
      block.tone !== 'neutral' &&
      block.tone !== 'emerald' &&
      block.tone !== 'sky' &&
      block.tone !== 'brand' &&
      block.tone !== 'muted'
    ) {
      issues.push('Notice tone is not supported.');
    }
    return;
  }
  if (block.type === 'roadmap') {
    if (
      !Array.isArray(block.items) ||
      block.items.length === 0 ||
      block.items.length > MAX_COMPOSITION_ITEMS
    ) {
      issues.push('Roadmap block requires a bounded items array.');
      return;
    }
    block.items.forEach((item, index) => {
      if (!isRecord(item)) {
        issues.push(`Roadmap item ${index + 1} must be an object.`);
        return;
      }
      textIssue(item.key, `Roadmap item ${index + 1} key`, 80, issues, true);
      textIssue(item.label, `Roadmap item ${index + 1} label`, 240, issues, true);
      textIssue(item.range, `Roadmap item ${index + 1} range`, 80, issues, true);
      textIssue(
        item.description,
        `Roadmap item ${index + 1} description`,
        MAX_COMPOSITION_TEXT,
        issues,
        true,
      );
    });
    return;
  }
  issues.push(
    `Unsupported composition block type${
      typeof block.type === 'string' ? ` "${block.type}"` : ''
    }.`,
  );
}

export function compositionIssues(input: {
  metadata: Record<string, unknown> | null | undefined;
  programVersionId: string | null | undefined;
  status: string | null | undefined;
  dayStart: number | null | undefined;
  dayEnd: number | null | undefined;
  durationDays?: number | null;
}): string[] {
  if (!metadataHasComposition(input.metadata)) return [];
  const issues: string[] = [];
  if (!input.programVersionId) {
    issues.push('Composition drafts require program_version_id.');
  }
  if (input.status != null && input.status !== 'draft') {
    issues.push('Composition rows must stay draft in this slice.');
  }
  if (
    input.dayStart != null &&
    input.dayEnd != null &&
    input.dayStart > input.dayEnd
  ) {
    issues.push('day_end must be greater than or equal to day_start.');
  }
  if (typeof input.durationDays === 'number') {
    if (input.dayStart != null && input.dayStart > input.durationDays) {
      issues.push(
        `day_start is outside the selected version duration of ${input.durationDays} days.`,
      );
    }
    if (input.dayEnd != null && input.dayEnd > input.durationDays) {
      issues.push(
        `day_end is outside the selected version duration of ${input.durationDays} days.`,
      );
    }
  }
  const blocks = input.metadata?.blocks;
  if (blocks != null && !Array.isArray(blocks)) {
    issues.push('Composition blocks must be an array.');
  }
  if (Array.isArray(blocks)) {
    if (blocks.length > MAX_COMPOSITION_BLOCKS) {
      issues.push(`Composition blocks exceed ${MAX_COMPOSITION_BLOCKS}.`);
    }
    const seenMedia = new Set<string>();
    for (const block of blocks) {
      if (!isRecord(block)) {
        issues.push('Each composition block must be an object.');
        continue;
      }
      validateCompositionBlock(block, issues, seenMedia);
    }
  }
  const hero = input.metadata?.hero;
  if (hero != null && !isRecord(hero)) {
    issues.push('Composition hero must be an object.');
  } else if (isRecord(hero)) {
    textIssue(hero.title, 'Hero title', 240, issues);
    textIssue(hero.eyebrow, 'Hero eyebrow', 160, issues);
    if (typeof hero.imageUrl === 'string' && hero.imageUrl.trim()) {
      if (!isSafeMediaReference(hero.imageUrl)) {
        issues.push('Hero image must be a site path or https URL.');
      }
      if (hero.imageUrl.trim() === PROGRAM_PREVIEW_TEST_AUDIO_PATH) {
        issues.push('The test audio file cannot be saved as authored program media.');
      }
    } else if (hero.imageUrl != null && hero.imageUrl !== '') {
      issues.push('Hero image must be text.');
    }
  }
  return issues;
}

export function mergeDeliveryMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    ...patch,
  };
}

export interface CompositionWriteDecision {
  ok: boolean;
  code?: 'COMPOSITION_WRITE_REJECTED';
  message?: string;
}

export function evaluateCompositionWrite(input: {
  existingStatus: string;
  existingVersionId: string | null;
  existingMetadata: Record<string, unknown> | null | undefined;
  nextStatus: string;
  nextVersionId: string | null;
  nextMetadata: Record<string, unknown> | null | undefined;
}): CompositionWriteDecision {
  const existingContract = metadataHasComposition(input.existingMetadata);
  const nextContract = metadataHasComposition(input.nextMetadata);
  const fail = (message: string): CompositionWriteDecision => ({
    ok: false,
    code: 'COMPOSITION_WRITE_REJECTED',
    message,
  });

  if (existingContract) {
    if (!nextContract) {
      return fail(
        'Removing or replacing the composition contract is not allowed.',
      );
    }
    if (input.nextStatus !== 'draft') {
      return fail('Composition rows must remain drafts.');
    }
    if ((input.nextVersionId ?? null) !== (input.existingVersionId ?? null)) {
      return fail('Composition rows cannot change program version.');
    }
    if (!input.nextVersionId) {
      return fail('Composition rows require an exact program version.');
    }
    return { ok: true };
  }
  if (
    input.existingStatus === 'published' &&
    nextContract
  ) {
    return fail(
      'Cannot attach a composition contract to a legacy published row.',
    );
  }
  if (
    input.existingStatus === 'published' &&
    input.nextVersionId !== input.existingVersionId
  ) {
    return fail('Cannot re-version a legacy published row in this slice.');
  }
  if (nextContract && input.nextStatus !== 'draft') {
    return fail('Composition rows cannot leave draft in this slice.');
  }
  if (nextContract && !input.nextVersionId) {
    return fail('Composition rows require an exact program version.');
  }
  return { ok: true };
}

export function versionBelongsToProgram(input: {
  programId: string;
  version: { id: string; program_id: string } | null;
}): { ok: true } | { ok: false; message: string } {
  if (!input.version || input.version.program_id !== input.programId) {
    return {
      ok: false,
      message: 'program_version_id does not belong to this program.',
    };
  }
  return { ok: true };
}

export interface EditorMediaBlockInput {
  id: string;
  type: '' | 'audio' | 'video';
  url: string;
  title: string;
  description: string;
}

export interface EditorCompositionInput {
  moduleKey: string;
  moduleType: ProgramDeliveryModuleType;
  title: string;
  eyebrow: string;
  body: string;
  dayStart: number | null;
  dayEnd: number | null;
  status: string;
  programVersionId: string;
  displayOrder: number | null;
  compositionEnabled: boolean;
  mediaBlocks: EditorMediaBlockInput[];
  heroTitle: string;
  heroEyebrow: string;
  heroImageUrl: string;
  metadata: Record<string, unknown>;
  capacityVariants: Record<string, unknown>;
  cta: Record<string, unknown>;
  anchor: Record<string, unknown>;
  statusVisibility?: ProgramDeliveryStatusVisibility[];
  safetyNotes?: string[];
  noClaimsNotes?: string[];
  durationDays?: number | null;
}

export interface CompositionSaveResult {
  payload: Record<string, unknown>;
  issues: string[];
}

function isMediaRecord(
  block: unknown,
): block is Record<string, unknown> & { type: 'audio' | 'video' } {
  return (
    isRecord(block) && (block.type === 'audio' || block.type === 'video')
  );
}

function mergeAuthoredMedia(
  existingBlocks: unknown[],
  edits: readonly EditorMediaBlockInput[],
  issues: string[],
): unknown[] {
  const editsById = new Map<string, EditorMediaBlockInput>();
  for (const edit of edits) {
    const id = edit.id.trim();
    if (id) editsById.set(id, edit);
  }
  const consumed = new Set<string>();
  const next: unknown[] = [];
  for (const block of existingBlocks) {
    if (!isMediaRecord(block)) {
      next.push(block);
      continue;
    }
    const id = typeof block.id === 'string' ? block.id : '';
    const edit = id ? editsById.get(id) : undefined;
    if (!edit) {
      next.push(block);
      continue;
    }
    consumed.add(id);
    if (!edit.type) continue;
    const parsed = parseMediaBlock({
      type: edit.type,
      id,
      url: edit.url,
      title: edit.title,
      description: edit.description,
    });
    if ('error' in parsed) {
      issues.push(parsed.error);
      continue;
    }
    next.push(parsed.block);
  }
  for (const edit of edits) {
    const id = edit.id.trim();
    if (!id || consumed.has(id) || !edit.type) continue;
    const parsed = parseMediaBlock({
      type: edit.type,
      id,
      url: edit.url,
      title: edit.title,
      description: edit.description,
    });
    if ('error' in parsed) {
      issues.push(parsed.error);
      continue;
    }
    next.push(parsed.block);
  }
  return next;
}

export function buildCompositionSavePayload(
  input: EditorCompositionInput,
): CompositionSaveResult {
  const metadata = mergeDeliveryMetadata(undefined, input.metadata);
  const shared = {
    program_version_id: input.programVersionId.trim() || null,
    module_key: input.moduleKey.trim(),
    module_type: input.moduleType,
    title: input.title.trim(),
    eyebrow: input.eyebrow.trim() || null,
    body: input.body.trim(),
    day_start: input.dayStart,
    day_end: input.dayEnd,
    display_order: input.displayOrder ?? undefined,
    status_visibility: input.statusVisibility,
    safety_notes: input.safetyNotes,
    no_claims_notes: input.noClaimsNotes,
    capacity_variants_json: input.capacityVariants,
    cta_json: input.cta,
    anchor_json: input.anchor,
  };
  if (!input.compositionEnabled) {
    return {
      payload: {
        ...shared,
        status: input.status,
        metadata,
      },
      issues: [],
    };
  }

  const issues: string[] = [];
  const existingBlocks = Array.isArray(metadata.blocks) ? metadata.blocks : [];
  const blocks = mergeAuthoredMedia(existingBlocks, input.mediaBlocks, issues);
  const hero: DeliveryCompositionHero = {};
  if (input.heroTitle.trim()) hero.title = input.heroTitle.trim();
  if (input.heroEyebrow.trim()) hero.eyebrow = input.heroEyebrow.trim();
  if (input.heroImageUrl.trim()) {
    if (
      !isSafeMediaReference(input.heroImageUrl) ||
      input.heroImageUrl.trim() === PROGRAM_PREVIEW_TEST_AUDIO_PATH
    ) {
      issues.push('Hero image must be a site path or https URL.');
    } else {
      hero.imageUrl = input.heroImageUrl.trim();
    }
  }
  const retained = { ...metadata };
  delete retained.hero;
  delete retained.blocks;
  const nextMetadata: Record<string, unknown> = {
    ...retained,
    composition: { contract: DELIVERY_COMPOSITION_CONTRACT },
    blocks,
  };
  if (Object.keys(hero).length > 0) nextMetadata.hero = hero;
  issues.push(
    ...compositionIssues({
      metadata: nextMetadata,
      programVersionId: input.programVersionId.trim(),
      status: 'draft',
      dayStart: input.dayStart,
      dayEnd: input.dayEnd,
      durationDays: input.durationDays,
    }),
  );
  return {
    payload: {
      ...shared,
      program_version_id: input.programVersionId.trim(),
      status: 'draft',
      metadata: nextMetadata,
    },
    issues,
  };
}

function mediaBlocksFrom(
  blocks: ProgramDeliveryBlock[] | undefined,
): ProgramDeliveryMediaBlock[] {
  return (blocks ?? []).flatMap((block) =>
    block.type === 'audio' || block.type === 'video' ? [block] : [],
  );
}

export function moduleCoversDay(
  module: Pick<ProgramDeliveryModuleDefinition, 'dayStart' | 'dayEnd'>,
  day: number,
): boolean {
  if (module.dayStart == null && module.dayEnd == null) return true;
  const start = module.dayStart ?? day;
  const end = module.dayEnd ?? day;
  return day >= start && day <= end;
}

export function shouldPreserveAuthoredOrder(
  modules: readonly ProgramDeliveryModuleDefinition[],
  ctx?: ProgramDeliveryRuntimeContext,
): boolean {
  return modules.some(
    (module) =>
      module.composition?.contract === DELIVERY_COMPOSITION_CONTRACT &&
      (ctx ? isDeliveryModuleVisible(module, ctx) : true),
  );
}

export function authoredModuleOrder<T>(modules: readonly T[]): T[] {
  return [...modules];
}

function modulesForView(
  modules: readonly ProgramDeliveryModuleDefinition[],
  viewedDay: number,
  ctx?: ProgramDeliveryRuntimeContext,
): readonly ProgramDeliveryModuleDefinition[] {
  if (!ctx) return modules.filter((module) => moduleCoversDay(module, viewedDay));
  return modules.filter((module) => isDeliveryModuleVisible(module, ctx));
}

export function heroForViewedDay(
  modules: readonly ProgramDeliveryModuleDefinition[],
  viewedDay: number,
  ctx?: ProgramDeliveryRuntimeContext,
): DeliveryCompositionHero | null {
  for (const module of modulesForView(modules, viewedDay, ctx)) {
    if (!module.composition?.hero) continue;
    return module.composition.hero;
  }
  return null;
}

export function mediaForViewedDay(
  modules: readonly ProgramDeliveryModuleDefinition[],
  viewedDay: number,
  ctx?: ProgramDeliveryRuntimeContext,
): ProgramDeliveryMediaBlock | null {
  for (const module of modulesForView(modules, viewedDay, ctx)) {
    const media = mediaBlocksFrom(module.blocks)[0];
    if (media) return media;
  }
  return null;
}

function isStatusVisibility(
  value: unknown,
): value is ProgramDeliveryStatusVisibility {
  return (
    typeof value === 'string' &&
    PROGRAM_DELIVERY_STATUS_VISIBILITIES.includes(
      value as ProgramDeliveryStatusVisibility,
    )
  );
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
  if (Array.isArray(value) && value.length > 0 && value.every(isVisibilityCondition)) {
    return value;
  }
  return undefined;
}

function parseCopy(value: unknown): ProgramDeliveryCopy | undefined {
  if (!isRecord(value)) return undefined;
  const copy: ProgramDeliveryCopy = {};
  if (typeof value.eyebrow === 'string' && value.eyebrow.trim()) {
    copy.eyebrow = value.eyebrow;
  }
  if (typeof value.title === 'string' && value.title.trim()) copy.title = value.title;
  if (typeof value.body === 'string' && value.body.trim()) copy.body = value.body;
  if (typeof value.practice === 'string' && value.practice.trim()) {
    copy.practice = value.practice;
  }
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
  if (!isRecord(value) || typeof value.label !== 'string' || !value.label.trim()) {
    return undefined;
  }
  return {
    label: value.label,
    href: typeof value.href === 'string' ? value.href : undefined,
    anchorKey: typeof value.anchorKey === 'string' ? value.anchorKey : undefined,
    tone:
      value.tone === 'neutral' ||
      value.tone === 'emerald' ||
      value.tone === 'sky' ||
      value.tone === 'brand' ||
      value.tone === 'muted'
        ? value.tone
        : undefined,
    disabled: typeof value.disabled === 'boolean' ? value.disabled : undefined,
    microcopy: typeof value.microcopy === 'string' ? value.microcopy : undefined,
    showWhen: parseShowWhen(value.showWhen),
  };
}

function parseStatusCopy(
  value: unknown,
): ProgramDeliveryModuleDefinition['statusCopy'] {
  if (!isRecord(value)) return undefined;
  const copy: NonNullable<ProgramDeliveryModuleDefinition['statusCopy']> = {};
  for (const status of PROGRAM_DELIVERY_STATUS_VISIBILITIES) {
    const parsed = parseCopy(value[status]);
    if (parsed) copy[status] = parsed;
  }
  return Object.keys(copy).length > 0 ? copy : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const notes = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
  return notes.length > 0 ? notes : undefined;
}

function legacyBlocks(value: unknown): ProgramDeliveryBlock[] | undefined {
  if (!Array.isArray(value) || !value.every(isRecord)) return undefined;
  const blocks: ProgramDeliveryBlock[] = [];
  for (const entry of value) {
    if (entry.type === 'audio' || entry.type === 'video') {
      const parsed = parseMediaBlock(entry);
      if ('block' in parsed) blocks.push(parsed.block);
      continue;
    }
    // Legacy rows predate the composition validator and may contain older
    // block shapes. Keep their existing interpretation while parsing authored
    // composition blocks strictly below.
    blocks.push(entry as unknown as ProgramDeliveryBlock);
  }
  return blocks;
}

function compositionBlocks(
  value: unknown,
): { blocks?: ProgramDeliveryBlock[]; issues: string[] } {
  if (value == null) return { issues: [] };
  if (!Array.isArray(value)) {
    return { issues: ['Composition blocks must be an array.'] };
  }
  const issues: string[] = [];
  const blocks: ProgramDeliveryBlock[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      issues.push('Each composition block must be an object.');
      continue;
    }
    if (entry.type === 'audio' || entry.type === 'video') {
      const parsed = parseMediaBlock(entry);
      if ('error' in parsed) issues.push(parsed.error);
      else blocks.push(parsed.block);
      continue;
    }
    if (
      entry.type === 'metrics' ||
      entry.type === 'list' ||
      entry.type === 'cards' ||
      entry.type === 'notice' ||
      entry.type === 'roadmap'
    ) {
      blocks.push(entry as unknown as ProgramDeliveryBlock);
      continue;
    }
    issues.push(
      `Unsupported composition block type${
        typeof entry.type === 'string' ? ` "${entry.type}"` : ''
      }.`,
    );
  }
  return { blocks, issues };
}

export interface DeliveryFieldInput {
  programSlug: string;
  moduleKey: string;
  moduleType: ProgramDeliveryModuleType;
  title: string;
  eyebrow?: string | null;
  body: string;
  dayStart?: number | null;
  dayEnd?: number | null;
  statusVisibility?: readonly string[] | null;
  metadata?: Record<string, unknown> | null;
  capacityVariants?: unknown;
  cta?: unknown;
  anchor?: unknown;
  safetyNotes?: readonly string[] | null;
  noClaimsNotes?: readonly string[] | null;
}

export function definitionFromDeliveryFields(input: DeliveryFieldInput): {
  definition: ProgramDeliveryModuleDefinition;
  issues: string[];
} {
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const anchor = isRecord(input.anchor) ? input.anchor : {};
  const composed = metadataHasComposition(metadata);
  const parsedBlocks = composed
    ? compositionBlocks(metadata.blocks)
    : { blocks: legacyBlocks(metadata.blocks), issues: [] as string[] };
  const visibility = (input.statusVisibility ?? []).filter(isStatusVisibility);
  return {
    issues: parsedBlocks.issues,
    definition: {
      id: input.moduleKey,
      programSlug: input.programSlug,
      moduleType: input.moduleType,
      groupId:
        (typeof metadata.groupId === 'string' ? metadata.groupId : undefined) ??
        (typeof anchor.groupId === 'string' ? anchor.groupId : undefined),
      groupTitle:
        typeof metadata.groupTitle === 'string' ? metadata.groupTitle : undefined,
      title: input.title,
      eyebrow: input.eyebrow ?? undefined,
      body: input.body,
      dayStart: input.dayStart ?? undefined,
      dayEnd: input.dayEnd ?? undefined,
      statusVisibility:
        visibility.length > 0 ? visibility : ['pre_start', 'active'],
      showWhen: parseShowWhen(metadata.showWhen),
      statusCopy: parseStatusCopy(metadata.statusCopy),
      capacityVariants: parseCapacityVariants(input.capacityVariants),
      blocks: parsedBlocks.blocks,
      cta: parseCta(input.cta),
      anchorId: typeof anchor.anchorId === 'string' ? anchor.anchorId : undefined,
      safetyNotes: parseStringList(input.safetyNotes),
      noClaimsNotes: parseStringList(input.noClaimsNotes),
      composition: composed
        ? {
            contract: DELIVERY_COMPOSITION_CONTRACT,
            hero: readCompositionHero(metadata),
          }
        : undefined,
    },
  };
}

export function definitionFromCompositionPayload(input: {
  programSlug: string;
  payload: Record<string, unknown>;
}): { definition: ProgramDeliveryModuleDefinition; issues: string[] } {
  const metadata = isRecord(input.payload.metadata) ? input.payload.metadata : {};
  return definitionFromDeliveryFields({
    programSlug: input.programSlug,
    moduleKey: String(input.payload.module_key ?? ''),
    moduleType: input.payload.module_type as ProgramDeliveryModuleType,
    title: String(input.payload.title ?? ''),
    eyebrow:
      typeof input.payload.eyebrow === 'string' ? input.payload.eyebrow : undefined,
    body: String(input.payload.body ?? ''),
    dayStart:
      typeof input.payload.day_start === 'number' ? input.payload.day_start : undefined,
    dayEnd:
      typeof input.payload.day_end === 'number' ? input.payload.day_end : undefined,
    statusVisibility: Array.isArray(input.payload.status_visibility)
      ? input.payload.status_visibility.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : undefined,
    metadata,
    capacityVariants: input.payload.capacity_variants_json,
    cta: input.payload.cta_json,
    anchor: input.payload.anchor_json,
    safetyNotes: Array.isArray(input.payload.safety_notes)
      ? input.payload.safety_notes.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : undefined,
    noClaimsNotes: Array.isArray(input.payload.no_claims_notes)
      ? input.payload.no_claims_notes.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : undefined,
  });
}

export function overlayEditedDefinition(
  modules: readonly ProgramDeliveryModuleDefinition[],
  edited: ProgramDeliveryModuleDefinition,
): ProgramDeliveryModuleDefinition[] {
  const index = modules.findIndex((module) => module.id === edited.id);
  if (index < 0) return [...modules, edited];
  return modules.map((module, position) => (position === index ? edited : module));
}

export function selectPreviewCheckinTemplate<
  T extends {
    program_version_id: string;
    checkin_day: number;
    status: string;
  },
>(templates: readonly T[], versionId: string, day: number): T | null {
  return (
    templates.find(
      (template) =>
        template.program_version_id === versionId &&
        template.checkin_day === day &&
        template.status === 'published',
    ) ?? null
  );
}

export function checkinPromptWithoutTemplate(
  modules: readonly ProgramDeliveryModuleDefinition[],
  day: number,
  template: ProgramCheckinTemplate | null,
): boolean {
  if (template) return false;
  return modules.some(
    (module) =>
      module.moduleType === 'checkin_prompt' && moduleCoversDay(module, day),
  );
}

export function withLocalPreviewCheckin(
  summary: ProgramRuntimeSummary,
  next: ProgramRuntimeSummary,
): ProgramRuntimeSummary {
  return {
    ...summary,
    latest_checkin_response: next.latest_checkin_response,
  };
}

export interface ComposedPreviewBindings {
  previewMode: true;
  suppressDayCompletion: true;
  compositionSource: DeliveryCompositionSource;
}

export function composedPreviewBindings(
  source: Exclude<DeliveryCompositionSource, 'delivery'>,
): ComposedPreviewBindings {
  return {
    previewMode: true,
    suppressDayCompletion: true,
    compositionSource: source,
  };
}
