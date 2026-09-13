import { createHash } from 'crypto';

import type { GroupedMealEntryPayload } from '@/lib/meals/types';
import { intakePayloadSchema } from '@/lib/journal/payloadValidators';
import {
  deleteEntries,
  getEntriesByIds,
  insertPreparedJournalEntries,
  prepareJournalEntryInsert,
  type JournalEntry,
  type JournalEntryPayload,
  type PreparedJournalEntryInsert,
} from '@/lib/journal/journalServerService';
import { assertAdjustedIntakePayloadAcceptable } from '@/lib/plans/plannedMealAdjustedPayloadValidation';
import {
  buildExactPlannedMealIntakePayload,
  plannedMealAlreadyLogged,
} from '@/lib/plans/plannedMealExecutionPayload';
import {
  claimPlannedMealJournalLink,
  getPlannedMeal,
} from '@/lib/plans/planServerService';
import type { PlannedMeal } from '@/lib/plans/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DRAFT_ENTRIES = 50;

export interface LogNutritionDraftCommitEntryInput {
  draftEntryId: string;
  payload: JournalEntryPayload;
  plannedMealId?: string | null;
  plannedMode?: 'exact' | 'adjusted' | null;
}

export interface LogNutritionDraftCommitInput {
  sessionId: string;
  occurredAt: string;
  entries: LogNutritionDraftCommitEntryInput[];
}

export interface LogNutritionDraftCommitResult {
  entries: JournalEntry[];
  alreadyCommitted: boolean;
}

export class LogNutritionDraftCommitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogNutritionDraftCommitValidationError';
    Object.setPrototypeOf(this, LogNutritionDraftCommitValidationError.prototype);
  }
}

function deterministicEntryId(sessionId: string, draftEntryId: string): string {
  const hex = createHash('sha256')
    .update(`fine-diet-log-draft-v1:${sessionId}:${draftEntryId}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex
    .slice(12, 16)
    .join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function requireValidInput(input: LogNutritionDraftCommitInput): Date {
  if (!UUID_RE.test(input.sessionId)) {
    throw new LogNutritionDraftCommitValidationError('sessionId must be a UUID.');
  }
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw new LogNutritionDraftCommitValidationError('At least one draft entry is required.');
  }
  if (input.entries.length > MAX_DRAFT_ENTRIES) {
    throw new LogNutritionDraftCommitValidationError(
      `A Log Draft can contain at most ${MAX_DRAFT_ENTRIES} entries.`,
    );
  }
  const ids = new Set<string>();
  for (const entry of input.entries) {
    if (!entry || !UUID_RE.test(entry.draftEntryId)) {
      throw new LogNutritionDraftCommitValidationError(
        'Every draft entry must have a UUID draftEntryId.',
      );
    }
    if (ids.has(entry.draftEntryId)) {
      throw new LogNutritionDraftCommitValidationError('Draft entry ids must be unique.');
    }
    ids.add(entry.draftEntryId);
    if (!entry.payload || typeof entry.payload !== 'object' || Array.isArray(entry.payload)) {
      throw new LogNutritionDraftCommitValidationError(
        'Every draft entry must include an intake payload.',
      );
    }
    if (entry.plannedMealId && !UUID_RE.test(entry.plannedMealId)) {
      throw new LogNutritionDraftCommitValidationError('plannedMealId must be a UUID.');
    }
    if (
      entry.plannedMealId &&
      entry.plannedMode !== 'exact' &&
      entry.plannedMode !== 'adjusted'
    ) {
      throw new LogNutritionDraftCommitValidationError(
        'A planned draft entry must specify exact or adjusted mode.',
      );
    }
  }
  const plannedIds = input.entries
    .map((entry) => entry.plannedMealId)
    .filter((id): id is string => Boolean(id));
  if (plannedIds.length > 1) {
    throw new LogNutritionDraftCommitValidationError(
      'A Log Draft can stage only one planned Meal context.',
    );
  }
  if (new Set(plannedIds).size !== plannedIds.length) {
    throw new LogNutritionDraftCommitValidationError(
      'The same planned meal cannot be committed more than once.',
    );
  }
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new LogNutritionDraftCommitValidationError('occurredAt must be a valid ISO date.');
  }
  return occurredAt;
}

function withCommitProvenance(
  payload: JournalEntryPayload,
  sessionId: string,
  draftEntryId: string,
): JournalEntryPayload {
  return {
    ...payload,
    log_draft_session_id: sessionId,
    log_draft_entry_id: draftEntryId,
  };
}

function adjustedPlannedPayload(
  rawPayload: JournalEntryPayload,
  plannedMealId: string,
  meal: PlannedMeal,
): GroupedMealEntryPayload {
  const parsed = intakePayloadSchema.safeParse(rawPayload);
  if (!parsed.success || !parsed.data.meal_group) {
    throw new LogNutritionDraftCommitValidationError(
      'Adjusted planned intake must include a valid grouped Meal payload.',
    );
  }
  if (
    parsed.data.source_planned_meal_id &&
    parsed.data.source_planned_meal_id !== plannedMealId
  ) {
    throw new LogNutritionDraftCommitValidationError(
      'Adjusted intake must reference the same planned meal.',
    );
  }
  const payload: GroupedMealEntryPayload = {
    ...parsed.data,
    name: parsed.data.name ?? meal.name ?? 'Planned meal',
    source_planned_meal_id: plannedMealId,
    logged_as_planned: false,
    meal_group: {
      ...parsed.data.meal_group,
      source_planned_meal_id: plannedMealId,
      logged_as_planned: false,
      detached_from_source: true,
    },
  };
  try {
    assertAdjustedIntakePayloadAcceptable(payload);
  } catch (error) {
    throw new LogNutritionDraftCommitValidationError(
      error instanceof Error ? error.message : 'Adjusted intake payload is invalid.',
    );
  }
  return payload;
}

async function resolvePlannedPayload(
  personId: string,
  entry: LogNutritionDraftCommitEntryInput,
): Promise<{ payload: JournalEntryPayload; meal: PlannedMeal | null }> {
  if (!entry.plannedMealId) return { payload: entry.payload, meal: null };
  const meal = await getPlannedMeal(personId, entry.plannedMealId);
  if (!meal) {
    throw new LogNutritionDraftCommitValidationError('Planned meal not found.');
  }
  if (plannedMealAlreadyLogged(meal)) {
    return { payload: entry.payload, meal };
  }
  if (meal.execution_state !== 'pending' || meal.journal_entry_id) {
    throw new LogNutritionDraftCommitValidationError(
      'The planned meal has already been handled.',
    );
  }
  if (entry.plannedMode === 'exact') {
    const context = entry.payload.meal_schedule_context;
    const exact = buildExactPlannedMealIntakePayload(meal);
    return {
      payload: context ? { ...exact, meal_schedule_context: context } : exact,
      meal,
    };
  }
  return {
    payload: adjustedPlannedPayload(entry.payload, entry.plannedMealId, meal),
    meal,
  };
}

function sortEntries(entries: JournalEntry[], ids: string[]): JournalEntry[] {
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...entries].sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  );
}

function entriesMatchSession(
  entries: JournalEntry[],
  sessionId: string,
  expectedIds: string[],
): boolean {
  if (entries.length !== expectedIds.length) return false;
  const expected = new Set(expectedIds);
  return entries.every(
    (entry) =>
      expected.has(entry.id) &&
      entry.payload.log_draft_session_id === sessionId,
  );
}

async function ensurePlannedLinks(
  personId: string,
  inputs: LogNutritionDraftCommitEntryInput[],
  expectedEntryIds: string[],
): Promise<void> {
  for (let index = 0; index < inputs.length; index += 1) {
    const plannedMealId = inputs[index].plannedMealId;
    if (!plannedMealId) continue;
    const expectedEntryId = expectedEntryIds[index];
    const meal = await getPlannedMeal(personId, plannedMealId);
    if (!meal) throw new Error('Planned meal not found while finalizing Log Draft.');
    if (
      meal.execution_state === 'eaten' &&
      meal.journal_entry_id === expectedEntryId
    ) {
      continue;
    }
    if (plannedMealAlreadyLogged(meal)) {
      throw new Error('Planned meal is linked to a different journal entry.');
    }
    const claimed = await claimPlannedMealJournalLink(
      personId,
      plannedMealId,
      expectedEntryId,
    );
    if (claimed) continue;
    const raced = await getPlannedMeal(personId, plannedMealId);
    if (
      raced?.execution_state !== 'eaten' ||
      raced.journal_entry_id !== expectedEntryId
    ) {
      throw new Error('Failed to link planned meal to committed journal entry.');
    }
  }
}

/**
 * Validate every top-level future entry before a single batch insert. Stable,
 * deterministic journal ids make the whole draft retry-safe without schema
 * changes. Planned execution is finalized server-side; if linking fails after
 * a new insert, the inserted batch is compensated as one person-scoped delete.
 */
export async function commitLogNutritionDraft(
  personId: string,
  input: LogNutritionDraftCommitInput,
): Promise<LogNutritionDraftCommitResult> {
  const occurredAt = requireValidInput(input);
  const expectedIds = input.entries.map((entry) =>
    deterministicEntryId(input.sessionId, entry.draftEntryId),
  );

  const existing = await getEntriesByIds(personId, expectedIds);
  if (existing.length > 0) {
    if (!entriesMatchSession(existing, input.sessionId, expectedIds)) {
      throw new Error('Log Draft commit conflicts with an existing journal entry.');
    }
    await ensurePlannedLinks(personId, input.entries, expectedIds);
    return {
      entries: sortEntries(existing, expectedIds),
      alreadyCommitted: true,
    };
  }

  const prepared: PreparedJournalEntryInsert[] = [];
  for (let index = 0; index < input.entries.length; index += 1) {
    const entry = input.entries[index];
    const resolved = await resolvePlannedPayload(personId, entry);
    if (
      resolved.meal &&
      plannedMealAlreadyLogged(resolved.meal) &&
      resolved.meal.journal_entry_id !== expectedIds[index]
    ) {
      throw new LogNutritionDraftCommitValidationError(
        'The planned meal has already been logged.',
      );
    }
    const payload = withCommitProvenance(
      resolved.payload,
      input.sessionId,
      entry.draftEntryId,
    );
    try {
      prepared.push(await prepareJournalEntryInsert({
        id: expectedIds[index],
        personId,
        entryType: 'intake',
        occurredAt,
        payload,
      }));
    } catch (error) {
      throw new LogNutritionDraftCommitValidationError(
        error instanceof Error ? error.message : 'Draft entry validation failed.',
      );
    }
  }

  let inserted: JournalEntry[];
  try {
    inserted = await insertPreparedJournalEntries(prepared);
  } catch (insertError) {
    const raced = await getEntriesByIds(personId, expectedIds);
    if (!entriesMatchSession(raced, input.sessionId, expectedIds)) {
      throw insertError;
    }
    await ensurePlannedLinks(personId, input.entries, expectedIds);
    return {
      entries: sortEntries(raced, expectedIds),
      alreadyCommitted: true,
    };
  }

  try {
    await ensurePlannedLinks(personId, input.entries, expectedIds);
  } catch (linkError) {
    await deleteEntries(personId, expectedIds);
    throw linkError;
  }

  return {
    entries: sortEntries(inserted, expectedIds),
    alreadyCommitted: false,
  };
}
