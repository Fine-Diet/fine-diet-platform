/**
 * API Route: Resolve Question Set
 * 
 * GET /api/question-sets/resolve?assessmentType=...&assessmentVersion=...&locale=...&preview=1
 * 
 * Resolves question set using CMS-first approach with file fallback.
 * Preview mode is only honored for editors/admins; otherwise ignored.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveQuestionSet } from '@/lib/assessments/questions/resolveQuestionSet';
import type { QuestionSetRef } from '@/lib/assessments/questions/resolveQuestionSet';

interface ResolveResponse {
  questionSet: any;
  source: 'cms' | 'file';
  questionSetId?: string;
  revisionId?: string;
  contentHash?: string;
  schemaVersion?: string;
  publishedAt?: string;
  isPreview?: boolean;
  questionsRef?: QuestionSetRef;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResolveResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { assessmentType, assessmentVersion, locale, preview, pinnedQuestionsRef } = req.query;

    // Validate required params
    if (!assessmentType || typeof assessmentType !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid assessmentType' });
    }

    if (!assessmentVersion || typeof assessmentVersion !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid assessmentVersion' });
    }

    // Get user role for preview check (silent - don't send error response if not authenticated)
    let userRole: 'user' | 'editor' | 'admin' = 'user';
    try {
      const { getCurrentUserWithRoleFromApi } = await import('@/lib/authServer');
      const user = await getCurrentUserWithRoleFromApi(req, res);
      if (user) {
        userRole = user.role;
      }
    } catch {
      // Not authenticated or error - default to 'user' (silent failure)
    }

    // Preview mode: only honor if user is editor/admin
    const usePreview = preview === '1' && (userRole === 'editor' || userRole === 'admin');
    
    // Parse pinnedQuestionsRef if provided
    let pinnedRef: QuestionSetRef | null = null;
    if (pinnedQuestionsRef && typeof pinnedQuestionsRef === 'string') {
      try {
        pinnedRef = JSON.parse(pinnedQuestionsRef) as QuestionSetRef;
      } catch {
        // Invalid JSON - ignore
      }
    }

    // Resolve question set
    const result = await resolveQuestionSet({
      assessmentType,
      assessmentVersion,
      locale: locale && typeof locale === 'string' ? locale : null,
      preview: usePreview,
      userRole,
      pinnedQuestionsRef: pinnedRef,
    });

    return res.status(200).json({
      questionSet: result.questionSet,
      source: result.source,
      questionSetId: result.questionSetRef?.questionSetId,
      revisionId: result.questionSetRef?.publishedRevisionId || result.questionSetRef?.previewRevisionId,
      contentHash: result.contentHash,
      schemaVersion: result.schemaVersion,
      publishedAt: result.publishedAt,
      isPreview: result.isPreview,
      questionsRef: result.questionSetRef,
    });
  } catch (error) {
    console.error('[resolve question set] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

