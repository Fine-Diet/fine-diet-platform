import { acquireSocialEvidence } from './acquisitionService';
import { classifySocialUrl } from './classifier';
import { createImportedMealFromSocialExtraction } from './draftMapper';
import { runSocialEvidenceExtraction } from './extractionService';
import {
  createSocialEvidenceSources,
  createSocialExtraction,
  createSocialImportJob,
  getSocialImportDetail,
  listSocialEvidenceSources,
  updateSocialImportJob,
} from './persistence';
import {
  SOCIAL_IMPORT_VERSION,
  type SocialImportCreateInput,
  type SocialImportDetail,
  type SocialImportJob,
  type SocialImportReviewItem,
} from './types';

export async function createSocialImport(args: {
  personId: string;
  input: SocialImportCreateInput;
}): Promise<SocialImportDetail> {
  const url = args.input.url?.trim() || null;
  const urlClassification = classifySocialUrl(url);
  let job = await createSocialImportJob({
    personId: args.personId,
    sourceUrl: urlClassification.canonical_url,
    platform: urlClassification.platform,
    rawRequest: args.input,
    reviewItems: urlClassification.review_items,
  });

  if (!urlClassification.supported) {
    job = (await updateSocialImportJob(args.personId, job.id, {
      status: 'manual_review',
      review_summary_json: urlClassification.review_items,
    })) as SocialImportJob;
    const detail = await getSocialImportDetail(args.personId, job.id);
    if (!detail) throw new Error('Failed to load social import after unsupported URL.');
    return detail;
  }

  return await runSocialImportPipeline({
    personId: args.personId,
    job,
    input: args.input,
    replaceEvidence: false,
  });
}

export async function rerunSocialImport(args: {
  personId: string;
  jobId: string;
  input: Partial<SocialImportCreateInput>;
}): Promise<SocialImportDetail | null> {
  const detail = await getSocialImportDetail(args.personId, args.jobId);
  if (!detail) return null;
  const mergedInput: SocialImportCreateInput = {
    ...detail.job.raw_request_json,
    ...args.input,
    url: detail.job.source_url,
  };
  return await runSocialImportPipeline({
    personId: args.personId,
    job: detail.job,
    input: mergedInput,
    replaceEvidence: true,
  });
}

async function runSocialImportPipeline(args: {
  personId: string;
  job: SocialImportJob;
  input: SocialImportCreateInput;
  replaceEvidence: boolean;
}): Promise<SocialImportDetail> {
  let job = args.job;
  const acquisition = await acquireSocialEvidence({
    personId: args.personId,
    platform: job.platform,
    url: job.source_url,
    input: args.input,
  });

  // Reruns append new user-assisted evidence instead of deleting prior
  // rows. This preserves the original audit trail while letting the
  // extractor consider the latest user-supplied context.
  const newEvidence = await createSocialEvidenceSources({
    personId: args.personId,
    jobId: job.id,
    sources: acquisition.sources,
  });
  const allEvidence = args.replaceEvidence
    ? await listSocialEvidenceSources(args.personId, job.id)
    : newEvidence;
  const acquiredReviewItems = mergeReviewItems(
    job.review_summary_json,
    acquisition.review_items,
  );
  job = (await updateSocialImportJob(args.personId, job.id, {
    status: 'evidence_acquired',
    review_summary_json: acquiredReviewItems,
  })) as SocialImportJob;

  const extractionResult = await runSocialEvidenceExtraction({
    ctx: { personId: args.personId },
    platform: job.platform,
    sourceUrl: job.source_url,
    evidenceSources: allEvidence,
    preexistingReviewItems: acquiredReviewItems,
  });

  const extraction = await createSocialExtraction({
    personId: args.personId,
    jobId: job.id,
    extractionVersion: SOCIAL_IMPORT_VERSION,
    provider: extractionResult.provider,
    model: extractionResult.model,
    output: extractionResult.payload,
    warnings: extractionResult.warnings,
  });

  job = (await updateSocialImportJob(args.personId, job.id, {
    status: 'extracted',
    content_type: extraction.output_json.content_type,
    review_summary_json: mergeReviewItems(
      acquiredReviewItems,
      extraction.output_json.review_items,
    ),
  })) as SocialImportJob;

  let importedMealId: string | null = null;
  try {
    const imported = await createImportedMealFromSocialExtraction({
      personId: args.personId,
      job,
      evidenceSources: allEvidence,
      extraction,
    });
    importedMealId = imported?.id ?? null;
  } catch (err) {
    const review: SocialImportReviewItem = {
      code: 'insufficient_evidence',
      severity: 'warning',
      message:
        err instanceof Error
          ? `Draft creation did not complete: ${err.message}`
          : 'Draft creation did not complete.',
      evidence_refs: [],
    };
    job = (await updateSocialImportJob(args.personId, job.id, {
      status: 'manual_review',
      review_summary_json: mergeReviewItems(job.review_summary_json, [review]),
      error_text: review.message,
    })) as SocialImportJob;
  }

  if (importedMealId) {
    job = (await updateSocialImportJob(args.personId, job.id, {
      status: 'draft_created',
      imported_meal_id: importedMealId,
    })) as SocialImportJob;
  } else if (job.status !== 'manual_review') {
    job = (await updateSocialImportJob(args.personId, job.id, {
      status: 'manual_review',
    })) as SocialImportJob;
  }

  const detail = await getSocialImportDetail(args.personId, job.id);
  if (!detail) throw new Error('Failed to load social import detail after pipeline.');
  return detail;
}

export { getSocialImportDetail };

export function mergeReviewItems(
  ...groups: Array<SocialImportReviewItem[] | null | undefined>
): SocialImportReviewItem[] {
  const merged = new Map<string, SocialImportReviewItem>();
  for (const group of groups) {
    for (const item of group ?? []) {
      const key = [
        item.code,
        item.severity,
        item.message.trim().toLowerCase(),
        item.evidence_refs
          .map((ref) => `${ref.evidence_source_id}:${ref.quote ?? ''}`)
          .sort()
          .join('|'),
      ].join('::');
      if (!merged.has(key)) merged.set(key, item);
    }
  }
  return Array.from(merged.values());
}
