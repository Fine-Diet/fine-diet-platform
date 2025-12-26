/**
 * Question Set Resolver
 * 
 * CMS-first resolution with file fallback.
 * Supports preview mode for editors/admins and pinning for reproducibility.
 */

import { loadQuestionSet, type QuestionSet } from './loadQuestionSet';

export interface QuestionSetRef {
  source: 'cms' | 'file';
  questionSetId?: string;
  publishedRevisionId?: string;
  previewRevisionId?: string;
  contentHash?: string;
  resolvedAt: string;
}

export interface ResolveQuestionSetOptions {
  assessmentType: string;
  assessmentVersion: string | number;
  locale?: string | null;
  preview?: boolean;
  userRole?: 'user' | 'editor' | 'admin';
  pinnedQuestionsRef?: QuestionSetRef | null;
}

export interface ResolveQuestionSetResult {
  questionSet: QuestionSet;
  source: 'cms' | 'file';
  contentHash?: string;
  schemaVersion?: string;
  publishedAt?: string;
  isPreview?: boolean;
  questionSetRef?: QuestionSetRef;
}

/**
 * Resolve question set from CMS or file system
 * 
 * Priority:
 * 1. If pinnedQuestionsRef exists and source is 'cms', fetch exact revision
 * 2. If preview=true and user is editor/admin, use preview_revision_id
 * 3. Try CMS published revision
 * 4. Fallback to file loader
 */
export async function resolveQuestionSet(
  options: ResolveQuestionSetOptions
): Promise<ResolveQuestionSetResult> {
  const { assessmentType, assessmentVersion, locale, preview, userRole, pinnedQuestionsRef } = options;

  // Step 1: If pinned reference exists (CMS), try to fetch exact revision
  if (pinnedQuestionsRef && pinnedQuestionsRef.source === 'cms' && pinnedQuestionsRef.publishedRevisionId) {
    try {
      // Dynamic import to avoid build-time env var checks
      const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
      
      const { data: rev, error } = await supabaseAdmin
        .from('question_set_revisions')
        .select('content_json, content_hash, schema_version, created_at')
        .eq('id', pinnedQuestionsRef.publishedRevisionId)
        .single();

      if (!error && rev) {
        // Validate it's a valid question set
        const questionSet = rev.content_json as QuestionSet;
        if (questionSet && questionSet.version === '2' && questionSet.assessmentType === assessmentType) {
          // Log for debugging
          if (process.env.NODE_ENV === 'development') {
            console.log('[resolveQuestionSet] Using pinned revision:', pinnedQuestionsRef.publishedRevisionId);
          }
          return {
            questionSet,
            source: 'cms',
            contentHash: rev.content_hash,
            schemaVersion: rev.schema_version,
            publishedAt: rev.created_at,
            questionSetRef: pinnedQuestionsRef, // Return existing ref (no update needed)
          };
        }
      }
      // If exact revision not found, fall through to published pointer
    } catch (error) {
      console.warn('[resolveQuestionSet] Error fetching pinned revision, falling back:', error);
      // Fall through to published pointer
    }
  }

  // Step 2: Try CMS (published or preview)
  const allowPreview = preview && (userRole === 'editor' || userRole === 'admin');
  
  if (allowPreview) {
    // Preview mode: try preview_revision_id first
    try {
      const questionSetRef = await fetchQuestionSetFromCMS(assessmentType, assessmentVersion, locale, true);
      if (questionSetRef) {
        // Create/update questionSetRef for preview
        const newRef: QuestionSetRef = {
          source: 'cms',
          questionSetId: questionSetRef.questionSetId,
          previewRevisionId: questionSetRef.revisionId,
          contentHash: questionSetRef.contentHash,
          resolvedAt: new Date().toISOString(),
        };
        return {
          questionSet: questionSetRef.questionSet,
          source: 'cms',
          contentHash: questionSetRef.contentHash,
          schemaVersion: questionSetRef.schemaVersion,
          publishedAt: questionSetRef.publishedAt,
          isPreview: true, // Mark as preview
          questionSetRef: newRef,
        };
      }
    } catch (error) {
      console.warn('[resolveQuestionSet] Preview fetch failed, trying published:', error);
      // Fall through to published
    }
  }

  // Step 3: Try CMS published revision
  try {
    const questionSetRef = await fetchQuestionSetFromCMS(assessmentType, assessmentVersion, locale, false);
    if (questionSetRef) {
      // Create questionSetRef for pinning
      const newRef: QuestionSetRef = {
        source: 'cms',
        questionSetId: questionSetRef.questionSetId,
        publishedRevisionId: questionSetRef.revisionId,
        contentHash: questionSetRef.contentHash,
        resolvedAt: new Date().toISOString(),
      };
      return {
        questionSet: questionSetRef.questionSet,
        source: 'cms',
        contentHash: questionSetRef.contentHash,
        schemaVersion: questionSetRef.schemaVersion,
        publishedAt: questionSetRef.publishedAt,
        questionSetRef: newRef,
      };
    }
  } catch (error) {
    console.warn('[resolveQuestionSet] CMS fetch failed, falling back to file:', error);
  }

  // Step 4: Fallback to file loader
  const fileQuestionSet = loadQuestionSet({ assessmentType, assessmentVersion, locale });
  if (!fileQuestionSet) {
    throw new Error(`Failed to load question set from file: ${assessmentType}/${assessmentVersion}${locale ? `/${locale}` : ''}`);
  }

  // Create questionSetRef for file source
  const newRef: QuestionSetRef = {
    source: 'file',
    resolvedAt: new Date().toISOString(),
  };

  return {
    questionSet: fileQuestionSet,
    source: 'file',
    questionSetRef: newRef,
  };
}

/**
 * Internal helper: Fetch question set from CMS
 */
async function fetchQuestionSetFromCMS(
  assessmentType: string,
  assessmentVersion: string | number,
  locale: string | null | undefined,
  usePreview: boolean
): Promise<{
  questionSet: QuestionSet;
  questionSetId: string;
  revisionId: string;
  contentHash: string;
  schemaVersion: string;
  publishedAt: string;
} | null> {
  // Dynamic import to avoid build-time env var checks
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
  
  const versionStr = String(assessmentVersion);
  
  // Find question set identity (handle NULL locale properly)
  let query = supabaseAdmin
    .from('question_sets')
    .select('id')
    .eq('assessment_type', assessmentType)
    .eq('assessment_version', versionStr);

  // Handle locale: if provided, match it; if null/undefined, match NULL
  if (locale === null || locale === undefined || locale === '') {
    query = query.is('locale', null);
  } else {
    query = query.eq('locale', locale);
  }

  const { data: questionSetRow, error: questionSetError } = await query.maybeSingle();

  if (questionSetError || !questionSetRow) {
    return null; // Question set not found in CMS
  }

  // Get pointer (preview or published) - select both fields to avoid TypeScript union type issues
  const { data: ptr, error: ptrError } = await supabaseAdmin
    .from('question_set_pointers')
    .select('preview_revision_id, published_revision_id')
    .eq('question_set_id', questionSetRow.id)
    .maybeSingle();

  if (ptrError || !ptr) {
    return null; // Pointer not found
  }

  // Type assertion to fix TypeScript inference issue with Supabase select
  const pointer = ptr as { preview_revision_id: string | null; published_revision_id: string | null };
  const revisionId = usePreview ? pointer.preview_revision_id : pointer.published_revision_id;
  if (!revisionId) {
    return null; // No revision pointer set
  }

  // Fetch revision content
  const { data: rev, error: revError } = await supabaseAdmin
    .from('question_set_revisions')
    .select('content_json, content_hash, schema_version, created_at')
    .eq('id', revisionId)
    .single();

  if (revError || !rev) {
    return null; // Revision not found
  }

  const questionSetData = rev.content_json as QuestionSet;
  if (!questionSetData || questionSetData.version !== '2' || questionSetData.assessmentType !== assessmentType) {
    return null; // Invalid question set structure
  }

  return {
    questionSet: questionSetData,
    questionSetId: questionSetRow.id,
    revisionId,
    contentHash: rev.content_hash,
    schemaVersion: rev.schema_version,
    publishedAt: rev.created_at,
  };
}

