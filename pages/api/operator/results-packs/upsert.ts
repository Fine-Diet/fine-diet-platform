/**
 * Operator API: Upsert Results Pack Revision
 *
 * POST /api/operator/results-packs/upsert
 *
 * Machine-to-machine endpoint. Authenticated by Bearer API key
 * (Authorization: Bearer <OPERATOR_API_KEY>).
 *
 * Upserts a draft revision for a specific results pack level with
 * provided content. Idempotent by content hash — skips if an identical
 * revision already exists for the pack.
 *
 * All writes are DRAFT. Publishing requires human review via Admin UI.
 *
 * Request body:
 * {
 *   assessmentType: string;      // e.g. "gut-check"
 *   resultsVersion: string;      // e.g. "v2"
 *   levelId: string;             // "level1" | "level2" | "level3" | "level4"
 *   content: object;             // validated ResultsPack JSON
 *   locale?: string | null;      // default: null
 *   brief?: string;              // stored as change_summary on the revision
 * }
 *
 * Response:
 * {
 *   ok: true;
 *   packId: string;
 *   revisionId: string;
 *   revisionNumber: number;
 *   skipped: boolean;           // true if content hash matched existing revision
 *   contentHash: string;
 *   reviewLink: string;
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireOperatorAuth } from '@/lib/operator/auth';
import { upsertResultsPackRevision, type LevelId } from '@/lib/operator/assessmentService';
import { sendOperatorReviewNotifications } from '@/lib/operator/notifications';

// ============================================================================
// Types
// ============================================================================

interface UpsertResultsPackRequest {
  assessmentType: string;
  resultsVersion: string;
  levelId: string;
  content: Record<string, unknown>;
  locale?: string | null;
  brief?: string;
}

interface UpsertResultsPackResponse {
  ok: true;
  packId: string;
  revisionId: string;
  revisionNumber: number;
  skipped: boolean;
  contentHash: string;
  reviewLink: string;
}

const VALID_LEVEL_IDS: LevelId[] = ['level1', 'level2', 'level3', 'level4'];

// ============================================================================
// Handler
// ============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpsertResultsPackResponse | { ok: false; error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const operator = requireOperatorAuth(req, res);
  if (!operator) return;

  const body = req.body as Partial<UpsertResultsPackRequest>;

  if (!body.assessmentType || typeof body.assessmentType !== 'string') {
    return res.status(400).json({ ok: false, error: 'assessmentType is required' });
  }
  if (!body.resultsVersion || typeof body.resultsVersion !== 'string') {
    return res.status(400).json({ ok: false, error: 'resultsVersion is required' });
  }
  if (!body.levelId || !VALID_LEVEL_IDS.includes(body.levelId as LevelId)) {
    return res.status(400).json({
      ok: false,
      error: `levelId must be one of: ${VALID_LEVEL_IDS.join(', ')}`,
    });
  }
  if (!body.content || typeof body.content !== 'object' || Array.isArray(body.content)) {
    return res.status(400).json({ ok: false, error: 'content must be a non-null object' });
  }

  const actorId = `operator:${operator.keyHint}`;

  try {
    const result = await upsertResultsPackRevision(
      {
        assessmentType: body.assessmentType.trim(),
        resultsVersion: body.resultsVersion.trim(),
        levelId: body.levelId as LevelId,
        locale: body.locale ?? null,
        content: body.content,
        brief: typeof body.brief === 'string' ? body.brief.trim() : undefined,
      },
      actorId
    );

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://myfinediet.com';
    const reviewLink = `${base}/admin/results-packs/${result.packId}`;

    // Fire review notification (non-blocking, skip if content unchanged)
    if (!result.skipped) {
      const idempotencyKey = `operator-results-pack-upsert-${result.revisionId}`;
      const notes = [
        `Assessment Type: ${body.assessmentType}`,
        `Results Version: ${body.resultsVersion}`,
        `Level: ${body.levelId}`,
        `Revision: ${result.revisionNumber}`,
        `Content Hash: ${result.contentHash}`,
        body.brief ? `Brief: ${body.brief}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      sendOperatorReviewNotifications({
        idempotencyKey,
        title: `[Operator] Results pack updated: ${body.assessmentType} / ${body.resultsVersion} / ${body.levelId}`,
        notes,
        primaryReviewUrl: reviewLink,
        metadata: {
          packId: result.packId,
          revisionId: result.revisionId,
          assessmentType: body.assessmentType,
          resultsVersion: body.resultsVersion,
          levelId: body.levelId,
        },
      }).catch((err) => {
        console.warn('[OperatorResultsPacksUpsert] Notification error (non-blocking):', err);
      });
    }

    return res.status(200).json({
      ok: true,
      packId: result.packId,
      revisionId: result.revisionId,
      revisionNumber: result.revisionNumber,
      skipped: result.skipped,
      contentHash: result.contentHash,
      reviewLink,
    });
  } catch (err) {
    console.error('[OperatorResultsPacksUpsert] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
}
