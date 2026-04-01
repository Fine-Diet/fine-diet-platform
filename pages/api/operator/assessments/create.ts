/**
 * Operator API: Create Assessment Draft
 *
 * POST /api/operator/assessments/create
 *
 * Machine-to-machine endpoint. Authenticated by Bearer API key
 * (Authorization: Bearer <OPERATOR_API_KEY>).
 *
 * Creates or scaffolds a full assessment draft:
 *   1. Ensures question_set identity exists (creates if missing)
 *   2. Ensures results_pack identities for levels 1–4 exist (creates if missing)
 *   3. Scaffolds a starter draft revision for the question set (if none exist)
 *   4. Scaffolds starter draft revisions for all 4 results packs (if none exist)
 *   5. Fires review notifications: second-brain task + email (non-blocking)
 *
 * All content is created as DRAFT. Human review + manual publish required.
 * All operations are idempotent — safe to retry.
 *
 * Request body:
 * {
 *   assessmentType: string;          // e.g. "gut-check"
 *   questionsVersion: number;        // e.g. 2
 *   resultsVersion: string;          // e.g. "v2"
 *   locale?: string | null;          // default: null
 *   brief?: string;                  // optional context stored in revision notes
 * }
 *
 * Response:
 * {
 *   ok: true;
 *   assessmentType: string;
 *   questionsVersion: number;
 *   resultsVersion: string;
 *   questionSetId: string;
 *   packs: { level1, level2, level3, level4 };
 *   drafts: { questionDraft, resultsDrafts };
 *   reviewLinks: { questionSet, resultsPacks };
 *   notifications: { secondBrainTaskCreated, emailQueued };
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireOperatorAuth } from '@/lib/operator/auth';
import { createAssessmentDraft } from '@/lib/operator/assessmentService';
import { sendOperatorReviewNotifications } from '@/lib/operator/notifications';
import type { OperatorAssessmentCreateResult } from '@/lib/operator/assessmentService';
import type { NotificationResult } from '@/lib/operator/notifications';

// ============================================================================
// Types
// ============================================================================

interface CreateAssessmentRequest {
  assessmentType: string;
  questionsVersion: number;
  resultsVersion: string;
  locale?: string | null;
  brief?: string;
}

interface CreateAssessmentResponse {
  ok: true;
  assessmentType: string;
  questionsVersion: number;
  resultsVersion: string;
  questionSetId: string;
  packs: OperatorAssessmentCreateResult['packs'];
  drafts: OperatorAssessmentCreateResult['drafts'];
  reviewLinks: OperatorAssessmentCreateResult['reviewLinks'];
  notifications: Pick<NotificationResult, 'secondBrainTaskCreated' | 'emailQueued'>;
}

// ============================================================================
// Handler
// ============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateAssessmentResponse | { ok: false; error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Operator API key auth
  const operator = requireOperatorAuth(req, res);
  if (!operator) return;

  // Parse and validate request body
  const body = req.body as Partial<CreateAssessmentRequest>;

  if (!body.assessmentType || typeof body.assessmentType !== 'string') {
    return res.status(400).json({ ok: false, error: 'assessmentType is required' });
  }

  if (body.questionsVersion === undefined || typeof body.questionsVersion !== 'number') {
    return res.status(400).json({ ok: false, error: 'questionsVersion must be a number' });
  }

  if (!body.resultsVersion || typeof body.resultsVersion !== 'string') {
    return res.status(400).json({ ok: false, error: 'resultsVersion is required' });
  }

  const input: CreateAssessmentRequest = {
    assessmentType: body.assessmentType.trim(),
    questionsVersion: body.questionsVersion,
    resultsVersion: body.resultsVersion.trim(),
    locale: body.locale ?? null,
    brief: typeof body.brief === 'string' ? body.brief.trim() : undefined,
  };

  // The actorId for audit logs identifies this as an operator write
  // We use a synthetic stable ID so audit rows are attributable
  const actorId = `operator:${operator.keyHint}`;

  try {
    // Execute full scaffold sequence
    const result = await createAssessmentDraft(input, actorId);

    // Fire review notifications (non-blocking — does not affect response)
    const idempotencyKey = `operator-assessment-review-${result.questionSetId}-${input.resultsVersion}`;

    const notificationNotes = [
      `Assessment Type: ${result.assessmentType}`,
      `Questions Version: ${result.questionsVersion}`,
      `Results Version: ${result.resultsVersion}`,
      `Question Set ID: ${result.questionSetId}`,
      `Results Pack IDs: ${Object.entries(result.packs).map(([l, id]) => `${l}=${id}`).join(', ')}`,
      input.brief ? `Brief: ${input.brief}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const notifications = await sendOperatorReviewNotifications({
      idempotencyKey,
      title: `[Operator] Review assessment draft: ${input.assessmentType} (q${input.questionsVersion} / ${input.resultsVersion})`,
      notes: notificationNotes,
      primaryReviewUrl: result.reviewLinks.questionSet,
      metadata: {
        questionSetId: result.questionSetId,
        packs: result.packs,
        assessmentType: result.assessmentType,
        questionsVersion: result.questionsVersion,
        resultsVersion: result.resultsVersion,
      },
    });

    if (notifications.errors.length > 0) {
      console.warn('[OperatorAssessmentsCreate] Notification errors (non-blocking):', notifications.errors);
    }

    return res.status(200).json({
      ok: true,
      assessmentType: result.assessmentType,
      questionsVersion: result.questionsVersion,
      resultsVersion: result.resultsVersion,
      questionSetId: result.questionSetId,
      packs: result.packs,
      drafts: result.drafts,
      reviewLinks: result.reviewLinks,
      notifications: {
        secondBrainTaskCreated: notifications.secondBrainTaskCreated,
        emailQueued: notifications.emailQueued,
      },
    });
  } catch (err) {
    console.error('[OperatorAssessmentsCreate] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
}
