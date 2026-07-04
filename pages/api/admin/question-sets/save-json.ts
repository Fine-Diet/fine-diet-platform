/**
 * API Route: Save Question Set from JSON (Direct Authoring)
 *
 * POST /api/admin/question-sets/save-json
 *
 * Lets an editor or admin save a validated QuestionSet JSON as an immutable
 * draft revision without uploading CSV. Reuses the shared save service that
 * the CSV importer uses, so both paths produce identical revision records.
 *
 * Body:
 *   {
 *     questionSet: QuestionSet,       // v2 schema JSON
 *     assessmentType?: string,        // defaults from questionSet.assessmentType
 *     assessmentVersion: string,      // required (identity; stored as TEXT)
 *     locale?: string | null,         // null/empty = default locale
 *     notes?: string,                 // optional author notes
 *     setPreview?: boolean            // optional: also set preview pointer
 *   }
 *
 * Responses:
 *   200 — created (draft revision)
 *   409 — duplicate content (existing revision returned)
 *   400 — validation error (errors[]) or bad request
 *   401/403 — auth
 *   500 — server error
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  saveQuestionSetRevision,
  type SavedRevisionInfo,
} from '@/lib/questionSet/saveQuestionSetRevision';

interface SaveJsonRequest {
  questionSet: unknown;
  assessmentType?: string;
  assessmentVersion?: string;
  locale?: string | null;
  notes?: string | null;
  setPreview?: boolean;
}

interface SaveJsonSuccessResponse {
  ok: true;
  kind: 'created' | 'duplicate';
  questionSetId: string;
  revisionId: string;
  revisionNumber: number;
  contentHash: string;
  status: 'draft';
  createdAt: string;
  previewSet: boolean;
  previewUrl: string;
  manageUrl: string;
}

interface SaveJsonValidationResponse {
  ok: false;
  kind: 'validation';
  errors: string[];
  warnings: string[];
}

interface SaveJsonErrorResponse {
  ok: false;
  kind: 'error';
  error: string;
}

type SaveJsonResponse =
  | SaveJsonSuccessResponse
  | SaveJsonValidationResponse
  | SaveJsonErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SaveJsonResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, kind: 'error', error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // requireRoleFromApi already sent the response
  }

  const body = req.body as SaveJsonRequest;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, kind: 'error', error: 'Request body required.' });
  }

  if (body.questionSet === undefined || body.questionSet === null) {
    return res
      .status(400)
      .json({ ok: false, kind: 'error', error: 'questionSet is required.' });
  }

  const assessmentVersion = body.assessmentVersion?.toString().trim();
  if (!assessmentVersion) {
    return res
      .status(400)
      .json({ ok: false, kind: 'error', error: 'assessmentVersion is required.' });
  }

  const result = await saveQuestionSetRevision({
    questionSetJson: body.questionSet,
    assessmentType: body.assessmentType,
    assessmentVersion,
    locale: body.locale,
    notes: body.notes,
    setPreview: Boolean(body.setPreview),
    actorId: user.id,
    auditAction: 'questions.save_json',
  });

  if (!result.ok) {
    if (result.kind === 'validation') {
      return res.status(400).json({
        ok: false,
        kind: 'validation',
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    return res.status(500).json({ ok: false, kind: 'error', error: result.error });
  }

  const rev: SavedRevisionInfo = result.revision;
  const response: SaveJsonSuccessResponse = {
    ok: true,
    kind: result.kind,
    questionSetId: rev.questionSetId,
    revisionId: rev.revisionId,
    revisionNumber: rev.revisionNumber,
    contentHash: rev.contentHash,
    status: 'draft',
    createdAt: rev.createdAt,
    previewSet: result.previewSet,
    previewUrl: result.previewUrl,
    manageUrl: `/admin/question-sets/${rev.questionSetId}`,
  };

  // 409 for duplicate content so callers can distinguish "no changes" from a
  // fresh save, while still returning the existing revision for context.
  return res.status(result.kind === 'duplicate' ? 409 : 200).json(response);
}
