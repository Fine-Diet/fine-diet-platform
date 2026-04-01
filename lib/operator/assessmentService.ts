/**
 * Operator Assessment Service
 *
 * Reusable service functions for creating and scaffolding assessments.
 * Used by the Operator API endpoints. Extracted here so the Operator API
 * does not call admin endpoints indirectly.
 *
 * All writes are draft-only. Publishing remains a human action.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { validateQuestionSet, hashQuestionSetJson } from '@/lib/questionSet/validateQuestionSet';
import { validateResultsPack, hashPackJson } from '@/lib/resultsPack/validateResultsPack';
import questionsV2Template from '@/content/assessments/gut-check/questions_v2.json';

// ============================================================================
// Types
// ============================================================================

export interface EnsureQuestionSetResult {
  questionSetId: string;
  created: boolean;
}

export interface EnsureResultsPacksResult {
  packs: { level1: string; level2: string; level3: string; level4: string };
  created: { level1: boolean; level2: boolean; level3: boolean; level4: boolean };
}

export interface ScaffoldQuestionDraftResult {
  revisionId: string;
  revisionNumber: number;
  skipped: boolean;
}

export interface ScaffoldResultsDraftResult {
  revisionId: string;
  revisionNumber: number;
  skipped: boolean;
}

export type LevelId = 'level1' | 'level2' | 'level3' | 'level4';

export interface OperatorAssessmentCreateInput {
  assessmentType: string;
  questionsVersion: number;
  resultsVersion: string;
  locale?: string | null;
  /** Operator-provided brief used as the notes field on created revisions */
  brief?: string;
}

export interface OperatorAssessmentCreateResult {
  assessmentType: string;
  questionsVersion: number;
  resultsVersion: string;
  questionSetId: string;
  packs: { level1: string; level2: string; level3: string; level4: string };
  drafts: {
    questionDraft: ScaffoldQuestionDraftResult | null;
    resultsDrafts: {
      level1: ScaffoldResultsDraftResult | null;
      level2: ScaffoldResultsDraftResult | null;
      level3: ScaffoldResultsDraftResult | null;
      level4: ScaffoldResultsDraftResult | null;
    };
  };
  reviewLinks: {
    questionSet: string;
    resultsPacks: { level1: string; level2: string; level3: string; level4: string };
  };
}

// ============================================================================
// Identity helpers
// ============================================================================

/**
 * Ensure a question_sets row exists for this (assessmentType, version, locale).
 * Creates it if missing. Idempotent.
 */
export async function ensureQuestionSetIdentity(
  assessmentType: string,
  versionInt: number,
  locale: string | null,
  actorId: string
): Promise<EnsureQuestionSetResult> {
  let query = supabaseAdmin
    .from('question_sets')
    .select('id')
    .eq('assessment_type', assessmentType)
    .eq('assessment_version', versionInt);

  if (locale === null) {
    query = query.is('locale', null);
  } else {
    query = query.eq('locale', locale);
  }

  const { data: existing, error: checkError } = await query.maybeSingle();

  if (checkError && checkError.code !== 'PGRST116') {
    throw new Error(`Failed to check question set identity: ${checkError.message}`);
  }

  if (existing) {
    return { questionSetId: existing.id, created: false };
  }

  const { data: newSet, error: createError } = await supabaseAdmin
    .from('question_sets')
    .insert({ assessment_type: assessmentType, assessment_version: versionInt, locale })
    .select('id')
    .single();

  if (createError) {
    throw new Error(`Failed to create question set identity: ${createError.message}`);
  }

  // Ensure pointers row
  const { error: ptrError } = await supabaseAdmin
    .from('question_set_pointers')
    .upsert({ question_set_id: newSet.id }, { onConflict: 'question_set_id' });

  if (ptrError) {
    console.warn('[OperatorAssessmentService] Non-blocking: pointers row error:', ptrError);
  }

  await writeAuditLog(actorId, 'operator.assessments.ensure_question_set', 'question_set', newSet.id, {
    assessment_type: assessmentType,
    assessment_version: versionInt,
    locale,
    created: true,
  });

  return { questionSetId: newSet.id, created: true };
}

/**
 * Ensure results_packs rows for levels 1–4 exist for this (assessmentType, resultsVersion, locale).
 * Creates any that are missing. Idempotent.
 */
export async function ensureResultsPackIdentities(
  assessmentType: string,
  resultsVersion: string,
  locale: string | null,
  actorId: string
): Promise<EnsureResultsPacksResult> {
  const levels: LevelId[] = ['level1', 'level2', 'level3', 'level4'];
  const packs: Record<string, string> = {};
  const created: Record<string, boolean> = {};

  for (const levelId of levels) {
    let q = supabaseAdmin
      .from('results_packs')
      .select('id')
      .eq('assessment_type', assessmentType)
      .eq('results_version', resultsVersion)
      .eq('level_id', levelId);

    if (locale === null) {
      q = q.is('locale', null);
    } else {
      q = q.eq('locale', locale);
    }

    const { data: existing, error: checkError } = await q.maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Failed to check results pack ${levelId}: ${checkError.message}`);
    }

    if (existing) {
      packs[levelId] = existing.id;
      created[levelId] = false;
    } else {
      const { data: newPack, error: createError } = await supabaseAdmin
        .from('results_packs')
        .insert({ assessment_type: assessmentType, results_version: resultsVersion, level_id: levelId, locale })
        .select('id')
        .single();

      if (createError) {
        throw new Error(`Failed to create results pack ${levelId}: ${createError.message}`);
      }

      packs[levelId] = newPack.id;
      created[levelId] = true;

      const { error: ptrError } = await supabaseAdmin
        .from('results_pack_pointers')
        .upsert({ pack_id: newPack.id }, { onConflict: 'pack_id' });

      if (ptrError) {
        console.warn(`[OperatorAssessmentService] Non-blocking: pointers row error for ${levelId}:`, ptrError);
      }
    }
  }

  await writeAuditLog(actorId, 'operator.assessments.ensure_results_packs', 'results_packs', null, {
    assessment_type: assessmentType,
    results_version: resultsVersion,
    locale,
    packs,
    created,
  });

  return {
    packs: packs as EnsureResultsPacksResult['packs'],
    created: created as EnsureResultsPacksResult['created'],
  };
}

// ============================================================================
// Draft creation
// ============================================================================

/**
 * Create a starter question set draft revision if none exist.
 * Skips if revisions already exist (idempotent).
 */
export async function scaffoldQuestionSetDraft(
  questionSetId: string,
  actorId: string,
  brief?: string
): Promise<ScaffoldQuestionDraftResult> {
  const { data: existing } = await supabaseAdmin
    .from('question_set_revisions')
    .select('id')
    .eq('question_set_id', questionSetId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { revisionId: existing[0].id, revisionNumber: 0, skipped: true };
  }

  const { data: qs, error: qsError } = await supabaseAdmin
    .from('question_sets')
    .select('assessment_type, assessment_version')
    .eq('id', questionSetId)
    .single();

  if (qsError || !qs) {
    throw new Error('Question set not found');
  }

  const starterContent = {
    ...questionsV2Template,
    assessmentType: qs.assessment_type,
    version: String(qs.assessment_version),
  };

  const validation = validateQuestionSet(starterContent);
  if (!validation.ok) {
    throw new Error(`Invalid question set starter template: ${validation.errors.join(', ')}`);
  }

  const content_hash = hashQuestionSetJson(validation.normalized!);

  const { data: rev, error } = await supabaseAdmin
    .from('question_set_revisions')
    .insert({
      question_set_id: questionSetId,
      revision_number: 1,
      status: 'draft',
      schema_version: 'v2_question_schema_1',
      content_json: validation.normalized,
      content_hash,
      notes: brief ?? 'Starter draft created by Operator API',
      created_by: null, // operator writes have no auth user; tracked in audit log
    })
    .select('id, revision_number')
    .single();

  if (error) {
    throw new Error(`Failed to create question set draft: ${error.message}`);
  }

  await writeAuditLog(actorId, 'operator.assessments.scaffold_question_draft', 'question_set_revision', rev.id, {
    question_set_id: questionSetId,
    revision_number: rev.revision_number,
  });

  return { revisionId: rev.id, revisionNumber: rev.revision_number, skipped: false };
}

/**
 * Create a starter results pack draft revision for one level if none exist.
 * Skips if revisions already exist (idempotent).
 */
export async function scaffoldResultsPackDraft(
  packId: string,
  levelId: LevelId,
  actorId: string,
  brief?: string
): Promise<ScaffoldResultsDraftResult> {
  const { data: existing } = await supabaseAdmin
    .from('results_pack_revisions')
    .select('id')
    .eq('pack_id', packId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { revisionId: existing[0].id, revisionNumber: 0, skipped: true };
  }

  const starterContent = {
    label: `(Draft) ${levelId.charAt(0).toUpperCase() + levelId.slice(1)} Title`,
    summary: '(Draft) Summary text...',
    keyPatterns: ['(Draft) Pattern 1', '(Draft) Pattern 2'],
    firstFocusAreas: ['(Draft) Focus area 1', '(Draft) Focus area 2'],
    methodPositioning: '(Draft) Method positioning text...',
    flow: {
      page1: {
        headline: '(Draft) Page 1 Headline',
        body: ['(Draft) Body paragraph 1', '(Draft) Body paragraph 2'],
      },
      page2: {
        headline: '(Draft) Page 2 Headline',
        body: ['(Draft) Body paragraph 1', '(Draft) Body paragraph 2'],
      },
      page3: {
        headline: '(Draft) Page 3 Headline',
        body: ['(Draft) Body paragraph 1', '(Draft) Body paragraph 2'],
      },
    },
  };

  const validation = validateResultsPack(starterContent);
  if (!validation.ok) {
    throw new Error(`Invalid results pack starter for ${levelId}: ${validation.errors.join(', ')}`);
  }

  const content_hash = hashPackJson(validation.normalized!);

  const { data: rev, error } = await supabaseAdmin
    .from('results_pack_revisions')
    .insert({
      pack_id: packId,
      revision_number: 1,
      status: 'draft',
      schema_version: 'v2_pack_schema_1',
      content_json: validation.normalized,
      content_hash,
      change_summary: brief ?? 'Starter draft created by Operator API',
      created_by: null, // operator writes have no auth user; tracked in audit log
    })
    .select('id, revision_number')
    .single();

  if (error) {
    throw new Error(`Failed to create results pack draft for ${levelId}: ${error.message}`);
  }

  await writeAuditLog(actorId, 'operator.assessments.scaffold_results_draft', 'results_pack_revision', rev.id, {
    pack_id: packId,
    level_id: levelId,
    revision_number: rev.revision_number,
  });

  return { revisionId: rev.id, revisionNumber: rev.revision_number, skipped: false };
}

// ============================================================================
// Orchestration
// ============================================================================

/**
 * Full assessment create/scaffold sequence.
 * Creates question set + results pack identities, then scaffolds draft revisions.
 * All idempotent — safe to retry.
 */
export async function createAssessmentDraft(
  input: OperatorAssessmentCreateInput,
  actorId: string
): Promise<OperatorAssessmentCreateResult> {
  const locale = input.locale ?? null;

  // 1. Ensure question set identity
  const { questionSetId } = await ensureQuestionSetIdentity(
    input.assessmentType,
    input.questionsVersion,
    locale,
    actorId
  );

  // 2. Ensure results pack identities (all 4 levels)
  const { packs } = await ensureResultsPackIdentities(
    input.assessmentType,
    input.resultsVersion,
    locale,
    actorId
  );

  // 3. Scaffold question set draft
  const questionDraft = await scaffoldQuestionSetDraft(questionSetId, actorId, input.brief);

  // 4. Scaffold results pack drafts for all 4 levels
  const levels: LevelId[] = ['level1', 'level2', 'level3', 'level4'];
  const resultsDrafts: Record<string, ScaffoldResultsDraftResult | null> = {};

  for (const levelId of levels) {
    resultsDrafts[levelId] = await scaffoldResultsPackDraft(
      packs[levelId],
      levelId,
      actorId,
      input.brief
    );
  }

  const reviewLinks = buildReviewLinks(questionSetId, packs);

  return {
    assessmentType: input.assessmentType,
    questionsVersion: input.questionsVersion,
    resultsVersion: input.resultsVersion,
    questionSetId,
    packs,
    drafts: {
      questionDraft,
      resultsDrafts: resultsDrafts as OperatorAssessmentCreateResult['drafts']['resultsDrafts'],
    },
    reviewLinks,
  };
}

// ============================================================================
// Review links
// ============================================================================

/**
 * Build admin review URLs for the created assessment content.
 * These are returned in the Operator API response so the caller
 * can share them or create a second-brain review task with a direct link.
 */
export function buildReviewLinks(
  questionSetId: string,
  packs: { level1: string; level2: string; level3: string; level4: string }
): OperatorAssessmentCreateResult['reviewLinks'] {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://myfinediet.com';
  return {
    questionSet: `${base}/admin/question-sets/${questionSetId}`,
    resultsPacks: {
      level1: `${base}/admin/results-packs/${packs.level1}`,
      level2: `${base}/admin/results-packs/${packs.level2}`,
      level3: `${base}/admin/results-packs/${packs.level3}`,
      level4: `${base}/admin/results-packs/${packs.level4}`,
    },
  };
}

// ============================================================================
// Audit log helper
// ============================================================================

async function writeAuditLog(
  actorHint: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from('content_audit_log').insert({
      actor_id: null, // operator writes have no auth user UUID; identity stored in metadata
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: { ...metadata, operator_key_hint: actorHint },
    });
  } catch (err) {
    console.warn('[OperatorAssessmentService] Non-blocking: audit log error:', err);
  }
}
