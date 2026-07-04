/**
 * Shared Question-Set Save Service
 *
 * Single server-side path for persisting a validated question-set revision.
 * Used by both the direct JSON authoring API and the CSV importer so both
 * produce identical immutable revision records, content hashes, identity rows,
 * and audit-log entries.
 *
 * Responsibilities (mirroring the original CSV importer behavior):
 *   1. Validate the QuestionSet JSON (v2 schema) via validateQuestionSet.
 *   2. Compute a stable SHA-256 content_hash from normalized JSON.
 *   3. Find or create the question_sets identity row by
 *      (assessment_type, assessment_version, locale).
 *   4. Reject duplicate content: if an immutable revision with the same
 *      content_hash already exists for this identity, return a `duplicate`
 *      result referencing the existing revision (callers decide the HTTP
 *      mapping). This is explicit and consistent with the prior importer.
 *   5. Insert a new immutable draft revision with a monotonically increasing
 *      revision_number, retrying once on revision_number race conditions.
 *   6. Optionally set the preview pointer when `setPreview` is true.
 *   7. Write a content_audit_log entry.
 *
 * This service does NOT publish. Publishing remains admin-only via
 * /api/admin/question-set-pointers/publish, which validates again before
 * setting published_revision_id. Public runtime behavior is unchanged unless
 * a revision is explicitly published.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  validateQuestionSet,
  hashQuestionSetJson,
  type QuestionSet,
} from './validateQuestionSet';

export interface SaveQuestionSetRevisionInput {
  /** Raw QuestionSet JSON (v2 schema). */
  questionSetJson: unknown;
  /** Identity: assessment_type. Defaults from questionSetJson.assessmentType. */
  assessmentType?: string;
  /** Identity: assessment_version (stored as TEXT in DB). */
  assessmentVersion?: string;
  /** Identity: locale (null/undefined/'' → NULL = default locale). */
  locale?: string | null;
  /** Optional author notes stored on the revision. */
  notes?: string | null;
  /** When true, set the saved revision as the preview pointer. */
  setPreview?: boolean;
  /** Actor writing the revision (profiles.id). */
  actorId: string | null | undefined;
  /** Audit action label (e.g. 'questions.import_csv' or 'questions.save_json'). */
  auditAction: string;
}

export interface SavedRevisionInfo {
  questionSetId: string;
  revisionId: string;
  revisionNumber: number;
  contentHash: string;
  status: 'draft';
  createdAt: string;
}

export type SaveQuestionSetRevisionResult =
  | { ok: true; kind: 'created'; revision: SavedRevisionInfo; previewUrl: string }
  | { ok: true; kind: 'duplicate'; revision: SavedRevisionInfo; previewUrl: string }
  | { ok: false; kind: 'validation'; errors: string[]; warnings: string[] }
  | { ok: false; kind: 'error'; error: string };

interface SaveContext {
  assessmentType: string;
  assessmentVersion: string;
  locale: string | null;
  notes: string | null;
}

function buildPreviewUrl(ctx: SaveContext): string {
  const params = new URLSearchParams({
    assessmentType: ctx.assessmentType,
    assessmentVersion: ctx.assessmentVersion,
    preview: '1',
  });
  if (ctx.locale) params.set('locale', ctx.locale);
  return `/api/question-sets/resolve?${params.toString()}`;
}

async function findOrCreateIdentity(
  ctx: SaveContext
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const localeValue = ctx.locale === null || ctx.locale === '' ? null : ctx.locale;

  let query = supabaseAdmin
    .from('question_sets')
    .select('id')
    .eq('assessment_type', ctx.assessmentType)
    .eq('assessment_version', ctx.assessmentVersion);

  if (localeValue === null) {
    query = query.is('locale', null);
  } else {
    query = query.eq('locale', localeValue);
  }

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) {
    return { ok: false, error: findError.message };
  }
  if (existing) {
    return { ok: true, id: existing.id };
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from('question_sets')
    .insert({
      assessment_type: ctx.assessmentType,
      assessment_version: ctx.assessmentVersion,
      locale: localeValue,
    })
    .select('id')
    .single();

  if (createError || !created) {
    return { ok: false, error: createError?.message || 'Failed to create question set identity' };
  }
  return { ok: true, id: created.id };
}

async function nextRevisionNumber(questionSetId: string): Promise<number> {
  const { data: lastRev } = await supabaseAdmin
    .from('question_set_revisions')
    .select('revision_number')
    .eq('question_set_id', questionSetId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (lastRev?.revision_number ?? 0) + 1;
}

function isContentHashDuplicateError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '23505' &&
    !!error.message &&
    (error.message.includes('qsr_unique_hash') || error.message.includes('content_hash'))
  );
}

async function insertRevision(
  questionSetId: string,
  revNumber: number,
  contentJson: QuestionSet,
  contentHash: string,
  notes: string | null,
  actorId: string | null | undefined
): Promise<{ ok: true; id: string; createdAt: string } | { ok: false; error: string; duplicate: boolean }> {
  const insertPayload = {
    question_set_id: questionSetId,
    revision_number: revNumber,
    status: 'draft',
    content_json: contentJson,
    content_hash: contentHash,
    notes,
    created_by: actorId ?? null,
  };

  const { data: revision, error: revisionError } = await supabaseAdmin
    .from('question_set_revisions')
    .insert(insertPayload)
    .select('id, created_at')
    .single();

  if (revisionError) {
    if (isContentHashDuplicateError(revisionError)) {
      return { ok: false, error: 'duplicate content hash', duplicate: true };
    }
    // Revision number race — retry once with a fresh number.
    if (revisionError.code === '23505') {
      const retryNum = await nextRevisionNumber(questionSetId);
      const { data: retry, error: retryError } = await supabaseAdmin
        .from('question_set_revisions')
        .insert({ ...insertPayload, revision_number: retryNum })
        .select('id, created_at')
        .single();

      if (retryError) {
        if (isContentHashDuplicateError(retryError)) {
          return { ok: false, error: 'duplicate content hash', duplicate: true };
        }
        return { ok: false, error: retryError.message, duplicate: false };
      }
      if (!retry) {
        return { ok: false, error: 'Failed to create revision', duplicate: false };
      }
      return { ok: true, id: retry.id, createdAt: retry.created_at };
    }
    return { ok: false, error: revisionError.message, duplicate: false };
  }
  if (!revision) {
    return { ok: false, error: 'Failed to create revision', duplicate: false };
  }
  return { ok: true, id: revision.id, createdAt: revision.created_at };
}

async function setPreviewPointer(
  questionSetId: string,
  revisionId: string,
  actorId: string | null | undefined
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('question_set_pointers')
    .upsert(
      {
        question_set_id: questionSetId,
        preview_revision_id: revisionId,
        updated_by: actorId ?? null,
      },
      { onConflict: 'question_set_id' }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function writeAuditLog(
  actorId: string | null | undefined,
  action: string,
  questionSetId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from('content_audit_log').insert({
      actor_id: actorId ?? null,
      action,
      entity_type: 'question_set',
      entity_id: questionSetId,
      metadata,
    });
  } catch (auditError) {
    console.warn('[saveQuestionSetRevision] Failed to write audit log:', auditError);
  }
}

/**
 * Validate, hash, persist, and (optionally) set preview for a QuestionSet.
 * Returns a discriminated result. Callers map `validation`/`duplicate`/`error`
 * to appropriate HTTP responses.
 */
export async function saveQuestionSetRevision(
  input: SaveQuestionSetRevisionInput
): Promise<SaveQuestionSetRevisionResult> {
  const assessmentType =
    input.assessmentType?.trim() ||
    (input.questionSetJson && typeof input.questionSetJson === 'object'
      ? (input.questionSetJson as { assessmentType?: unknown }).assessmentType
      : undefined);

  if (!assessmentType || typeof assessmentType !== 'string') {
    return { ok: false, kind: 'validation', errors: ['assessmentType is required.'], warnings: [] };
  }

  const assessmentVersion = input.assessmentVersion?.trim();
  if (!assessmentVersion) {
    return {
      ok: false,
      kind: 'validation',
      errors: ['assessmentVersion is required.'],
      warnings: [],
    };
  }

  const ctx: SaveContext = {
    assessmentType,
    assessmentVersion,
    locale: input.locale?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  // 1. Validate structure.
  const validation = validateQuestionSet(input.questionSetJson);
  if (!validation.ok || !validation.normalized) {
    return {
      ok: false,
      kind: 'validation',
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  // 2. Hash normalized content.
  const contentHash = hashQuestionSetJson(validation.normalized);
  const normalizedQuestionSet = validation.normalized as QuestionSet;

  // 3. Identity row.
  const identity = await findOrCreateIdentity(ctx);
  if (!identity.ok) {
    return { ok: false, kind: 'error', error: identity.error };
  }
  const questionSetId = identity.id;

  // 4. Duplicate content check (explicit, consistent with prior importer).
  const { data: existingRevision } = await supabaseAdmin
    .from('question_set_revisions')
    .select('id, revision_number, status, created_at')
    .eq('question_set_id', questionSetId)
    .eq('content_hash', contentHash)
    .maybeSingle();

  if (existingRevision) {
    return {
      ok: true,
      kind: 'duplicate',
      revision: {
        questionSetId,
        revisionId: existingRevision.id,
        revisionNumber: existingRevision.revision_number,
        contentHash,
        status: 'draft',
        createdAt: existingRevision.created_at,
      },
      previewUrl: buildPreviewUrl(ctx),
    };
  }

  // 5. Insert immutable draft revision.
  const revNumber = await nextRevisionNumber(questionSetId);
  const inserted = await insertRevision(
    questionSetId,
    revNumber,
    normalizedQuestionSet,
    contentHash,
    ctx.notes,
    input.actorId
  );
  if (!inserted.ok) {
    if (inserted.duplicate) {
      // Lost a race against an identical save — re-read the existing revision.
      const { data: race } = await supabaseAdmin
        .from('question_set_revisions')
        .select('id, revision_number, status, created_at')
        .eq('question_set_id', questionSetId)
        .eq('content_hash', contentHash)
        .maybeSingle();
      if (race) {
        return {
          ok: true,
          kind: 'duplicate',
          revision: {
            questionSetId,
            revisionId: race.id,
            revisionNumber: race.revision_number,
            contentHash,
            status: 'draft',
            createdAt: race.created_at,
          },
          previewUrl: buildPreviewUrl(ctx),
        };
      }
    }
    return { ok: false, kind: 'error', error: inserted.error };
  }

  // 6. Optional preview pointer.
  if (input.setPreview) {
    const previewResult = await setPreviewPointer(questionSetId, inserted.id, input.actorId);
    if (!previewResult.ok) {
      return { ok: false, kind: 'error', error: previewResult.error || 'Failed to set preview pointer' };
    }
  }

  // 7. Audit log.
  await writeAuditLog(input.actorId, input.auditAction, questionSetId, {
    assessment_type: ctx.assessmentType,
    assessment_version: ctx.assessmentVersion,
    locale: ctx.locale,
    revision_id: inserted.id,
    revision_number: revNumber,
    section_count: normalizedQuestionSet.sections.length,
    question_count: normalizedQuestionSet.questions.length,
    set_preview: Boolean(input.setPreview),
  });

  return {
    ok: true,
    kind: 'created',
    revision: {
      questionSetId,
      revisionId: inserted.id,
      revisionNumber: revNumber,
      contentHash,
      status: 'draft',
      createdAt: inserted.createdAt,
    },
    previewUrl: buildPreviewUrl(ctx),
  };
}
