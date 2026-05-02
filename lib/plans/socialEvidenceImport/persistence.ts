import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { ImportedMeal } from '@/lib/plans/types';
import type {
  SocialEvidenceQuality,
  SocialEvidenceSourceKind,
  SocialImportContentType,
  SocialImportCreateInput,
  SocialImportDetail,
  SocialImportEvidenceSource,
  SocialImportExtraction,
  SocialImportExtractionPayload,
  SocialImportJob,
  SocialImportJobStatus,
  SocialImportPlatform,
  SocialImportReviewItem,
} from './types';

interface SocialImportJobRow {
  id: string;
  person_id: string;
  source_url: string | null;
  platform: SocialImportPlatform;
  content_type: SocialImportContentType;
  status: SocialImportJobStatus;
  imported_meal_id: string | null;
  raw_request_json: SocialImportCreateInput;
  review_summary_json: SocialImportReviewItem[];
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

interface SocialEvidenceRow {
  id: string;
  job_id: string;
  person_id: string;
  source_kind: SocialEvidenceSourceKind;
  source_label: string | null;
  platform: SocialImportPlatform;
  raw_text: string | null;
  normalized_text: string | null;
  language: string | null;
  quality: SocialEvidenceQuality;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

interface SocialExtractionRow {
  id: string;
  job_id: string;
  person_id: string;
  extraction_version: string;
  provider: string;
  model: string | null;
  output_json: SocialImportExtractionPayload;
  warnings_json: string[];
  created_at: string;
}

export interface CreateEvidenceSourceInput {
  source_kind: SocialEvidenceSourceKind;
  source_label?: string | null;
  platform: SocialImportPlatform;
  raw_text?: string | null;
  normalized_text?: string | null;
  language?: string | null;
  quality: SocialEvidenceQuality;
  metadata_json?: Record<string, unknown>;
}

export function rowToJob(row: SocialImportJobRow): SocialImportJob {
  return {
    id: row.id,
    person_id: row.person_id,
    source_url: row.source_url,
    platform: row.platform,
    content_type: row.content_type,
    status: row.status,
    imported_meal_id: row.imported_meal_id,
    raw_request_json: row.raw_request_json ?? {},
    review_summary_json: row.review_summary_json ?? [],
    error_text: row.error_text,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToEvidence(row: SocialEvidenceRow): SocialImportEvidenceSource {
  return {
    id: row.id,
    job_id: row.job_id,
    person_id: row.person_id,
    source_kind: row.source_kind,
    source_label: row.source_label,
    platform: row.platform,
    raw_text: row.raw_text,
    normalized_text: row.normalized_text,
    language: row.language,
    quality: row.quality,
    metadata_json: row.metadata_json ?? {},
    created_at: row.created_at,
  };
}

function rowToExtraction(row: SocialExtractionRow): SocialImportExtraction {
  return {
    id: row.id,
    job_id: row.job_id,
    person_id: row.person_id,
    extraction_version: row.extraction_version,
    provider: row.provider,
    model: row.model,
    output_json: row.output_json,
    warnings_json: row.warnings_json ?? [],
    created_at: row.created_at,
  };
}

export async function createSocialImportJob(args: {
  personId: string;
  sourceUrl: string | null;
  platform: SocialImportPlatform;
  rawRequest: SocialImportCreateInput;
  reviewItems?: SocialImportReviewItem[];
}): Promise<SocialImportJob> {
  const { data, error } = await supabaseAdmin
    .from('social_import_jobs')
    .insert({
      person_id: args.personId,
      source_url: args.sourceUrl,
      platform: args.platform,
      raw_request_json: args.rawRequest,
      review_summary_json: args.reviewItems ?? [],
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create social_import_job: ${error.message}`);
  return rowToJob(data as SocialImportJobRow);
}

export async function updateSocialImportJob(
  personId: string,
  id: string,
  patch: Partial<{
    content_type: SocialImportContentType;
    status: SocialImportJobStatus;
    imported_meal_id: string | null;
    review_summary_json: SocialImportReviewItem[];
    error_text: string | null;
  }>,
): Promise<SocialImportJob | null> {
  const updates: Record<string, unknown> = {};
  if (patch.content_type !== undefined) updates.content_type = patch.content_type;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.imported_meal_id !== undefined)
    updates.imported_meal_id = patch.imported_meal_id;
  if (patch.review_summary_json !== undefined)
    updates.review_summary_json = patch.review_summary_json;
  if (patch.error_text !== undefined) updates.error_text = patch.error_text;
  if (Object.keys(updates).length === 0) return getSocialImportJob(personId, id);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('social_import_jobs')
    .update(updates)
    .eq('id', id)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update social_import_job: ${error.message}`);
  return data ? rowToJob(data as SocialImportJobRow) : null;
}

export async function getSocialImportJob(
  personId: string,
  id: string,
): Promise<SocialImportJob | null> {
  const { data, error } = await supabaseAdmin
    .from('social_import_jobs')
    .select('*')
    .eq('id', id)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load social_import_job: ${error.message}`);
  return data ? rowToJob(data as SocialImportJobRow) : null;
}

export async function createSocialEvidenceSources(args: {
  personId: string;
  jobId: string;
  sources: CreateEvidenceSourceInput[];
}): Promise<SocialImportEvidenceSource[]> {
  if (args.sources.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('social_import_evidence_sources')
    .insert(
      args.sources.map((source) => ({
        job_id: args.jobId,
        person_id: args.personId,
        source_kind: source.source_kind,
        source_label: source.source_label ?? null,
        platform: source.platform,
        raw_text: source.raw_text ?? null,
        normalized_text: source.normalized_text ?? null,
        language: source.language ?? null,
        quality: source.quality,
        metadata_json: source.metadata_json ?? {},
      })),
    )
    .select('*');
  if (error) {
    throw new Error(`Failed to insert social evidence sources: ${error.message}`);
  }
  return (data as SocialEvidenceRow[]).map(rowToEvidence);
}

export async function listSocialEvidenceSources(
  personId: string,
  jobId: string,
): Promise<SocialImportEvidenceSource[]> {
  const { data, error } = await supabaseAdmin
    .from('social_import_evidence_sources')
    .select('*')
    .eq('person_id', personId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list social evidence sources: ${error.message}`);
  return (data as SocialEvidenceRow[]).map(rowToEvidence);
}

export async function createSocialExtraction(args: {
  personId: string;
  jobId: string;
  extractionVersion: string;
  provider: string;
  model: string | null;
  output: SocialImportExtractionPayload;
  warnings: string[];
}): Promise<SocialImportExtraction> {
  const { data, error } = await supabaseAdmin
    .from('social_import_extractions')
    .insert({
      job_id: args.jobId,
      person_id: args.personId,
      extraction_version: args.extractionVersion,
      provider: args.provider,
      model: args.model,
      output_json: args.output,
      warnings_json: args.warnings,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to insert social extraction: ${error.message}`);
  return rowToExtraction(data as SocialExtractionRow);
}

export async function getLatestSocialExtraction(
  personId: string,
  jobId: string,
): Promise<SocialImportExtraction | null> {
  const { data, error } = await supabaseAdmin
    .from('social_import_extractions')
    .select('*')
    .eq('person_id', personId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load social extraction: ${error.message}`);
  return data ? rowToExtraction(data as SocialExtractionRow) : null;
}

export async function getSocialImportDetail(
  personId: string,
  id: string,
): Promise<SocialImportDetail | null> {
  const job = await getSocialImportJob(personId, id);
  if (!job) return null;
  const [evidence_sources, extraction] = await Promise.all([
    listSocialEvidenceSources(personId, id),
    getLatestSocialExtraction(personId, id),
  ]);
  let imported_meal: ImportedMeal | null = null;
  if (job.imported_meal_id) {
    const { getImportedMeal } = await import('@/lib/plans/importsServerService');
    imported_meal = await getImportedMeal(personId, job.imported_meal_id);
  }
  return { job, evidence_sources, extraction, imported_meal };
}
