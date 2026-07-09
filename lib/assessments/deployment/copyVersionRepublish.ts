import type { SupabaseClient } from '@supabase/supabase-js';
import { hashPackJson, validateResultsPack } from '@/lib/resultsPack/validateResultsPack';
import type {
  AssessmentDeploymentConfig,
  CopyVersionRepublishResult,
} from '@/lib/assessments/deployment/types';

type SupabaseAdmin = SupabaseClient;

export async function republishCopyVersionForLevel(
  config: AssessmentDeploymentConfig,
  levelId: string,
  dryRun: boolean,
  supabaseAdminClient: SupabaseAdmin
): Promise<CopyVersionRepublishResult> {
  const republish = config.copyVersionRepublish;
  if (!republish) {
    return {
      levelId,
      packId: '',
      beforeRevisionId: null,
      beforeRevisionNumber: null,
      beforeCopyVersion: null,
      status: 'fail',
      detail: 'copyVersionRepublish not configured for this assessment',
    };
  }

  const packRef = republish.packIds[levelId];
  if (!packRef) {
    return {
      levelId,
      packId: '',
      beforeRevisionId: null,
      beforeRevisionNumber: null,
      beforeCopyVersion: null,
      status: 'fail',
      detail: `No pack ID configured for level ${levelId}`,
    };
  }

  const { packId } = packRef;
  const { data: pointer, error: pointerErr } = await supabaseAdminClient
    .from('results_pack_pointers')
    .select('published_revision_id')
    .eq('pack_id', packId)
    .maybeSingle();

  if (pointerErr || !pointer?.published_revision_id) {
    return {
      levelId,
      packId,
      beforeRevisionId: null,
      beforeRevisionNumber: null,
      beforeCopyVersion: null,
      status: 'fail',
      detail: pointerErr?.message ?? 'No published revision pointer',
    };
  }

  const { data: publishedRev, error: revErr } = await supabaseAdminClient
    .from('results_pack_revisions')
    .select('id, revision_number, content_json')
    .eq('id', pointer.published_revision_id)
    .single();

  if (revErr || !publishedRev) {
    return {
      levelId,
      packId,
      beforeRevisionId: pointer.published_revision_id,
      beforeRevisionNumber: null,
      beforeCopyVersion: null,
      status: 'fail',
      detail: revErr?.message ?? 'Published revision not found',
    };
  }

  const beforeCopyVersion =
    typeof publishedRev.content_json?.copyVersion === 'string'
      ? publishedRev.content_json.copyVersion
      : null;

  if (beforeCopyVersion === republish.targetCopyVersion) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      afterRevisionId: publishedRev.id,
      afterRevisionNumber: publishedRev.revision_number,
      afterCopyVersion: beforeCopyVersion,
      status: 'skipped',
      detail: `Already at copyVersion ${republish.targetCopyVersion}`,
    };
  }

  const nextContent = {
    ...publishedRev.content_json,
    copyVersion: republish.targetCopyVersion,
  };

  const validation = validateResultsPack(nextContent);
  if (!validation.ok || !validation.normalized) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      status: 'fail',
      detail: `Validation failed: ${validation.errors.join('; ')}`,
    };
  }

  const content_hash = hashPackJson(validation.normalized);
  const nextRevNumber = publishedRev.revision_number + 1;

  if (dryRun) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      afterRevisionNumber: nextRevNumber,
      afterCopyVersion: republish.targetCopyVersion,
      status: 'pass',
      detail: 'Dry-run OK — would create and publish revision',
    };
  }

  const { data: inserted, error: insertErr } = await supabaseAdminClient
    .from('results_pack_revisions')
    .insert({
      pack_id: packId,
      revision_number: nextRevNumber,
      status: 'draft',
      schema_version: 'v2_pack_schema_1',
      content_json: validation.normalized,
      content_hash,
      change_summary: republish.changeSummary,
      validation_errors: null,
      created_by: republish.actorId,
    })
    .select('id, revision_number')
    .single();

  if (insertErr || !inserted) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      status: 'fail',
      detail: insertErr?.message ?? 'Insert failed',
    };
  }

  const { error: ptrErr } = await supabaseAdminClient.from('results_pack_pointers').upsert({
    pack_id: packId,
    published_revision_id: inserted.id,
    preview_revision_id: null,
    updated_by: republish.actorId,
  });

  if (ptrErr) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      afterRevisionId: inserted.id,
      afterRevisionNumber: inserted.revision_number,
      status: 'fail',
      detail: `Revision created but publish pointer failed: ${ptrErr.message}`,
    };
  }

  return {
    levelId,
    packId,
    beforeRevisionId: publishedRev.id,
    beforeRevisionNumber: publishedRev.revision_number,
    beforeCopyVersion,
    afterRevisionId: inserted.id,
    afterRevisionNumber: inserted.revision_number,
    afterCopyVersion: republish.targetCopyVersion,
    status: 'pass',
    detail: 'Revision created and published',
  };
}

export async function runCopyVersionRepublish(
  config: AssessmentDeploymentConfig,
  dryRun: boolean,
  supabaseAdminClient: SupabaseAdmin
): Promise<CopyVersionRepublishResult[]> {
  const results: CopyVersionRepublishResult[] = [];
  for (const levelId of config.results.levelIds) {
    results.push(
      await republishCopyVersionForLevel(config, levelId, dryRun, supabaseAdminClient)
    );
  }
  return results;
}
