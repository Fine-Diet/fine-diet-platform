/**
 * API Route: Scaffold Starter Drafts
 * 
 * POST /api/admin/assessments/scaffold-drafts
 * 
 * Creates starter draft revisions for question sets and results packs
 * if they have 0 revisions. Otherwise no-op.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { validateQuestionSet, hashQuestionSetJson } from '@/lib/questionSet/validateQuestionSet';
import { validateResultsPack, hashPackJson } from '@/lib/resultsPack/validateResultsPack';
import questionsV2Template from '@/content/assessments/gut-check/questions_v2.json';

interface ScaffoldDraftsRequest {
  questionSetId?: string;
  resultsPackIds?: {
    level1?: string;
    level2?: string;
    level3?: string;
    level4?: string;
  };
}

interface ScaffoldDraftsResponse {
  created: {
    questionDraft?: {
      revisionId: string;
      revisionNumber: number;
    };
    resultsDrafts?: {
      level1?: { revisionId: string; revisionNumber: number };
      level2?: { revisionId: string; revisionNumber: number };
      level3?: { revisionId: string; revisionNumber: number };
      level4?: { revisionId: string; revisionNumber: number };
    };
  };
  skipped: {
    questionSet?: boolean;
    resultsPacks?: string[];
  };
  error?: string;
}

/**
 * Create starter question set draft
 */
async function createQuestionSetDraft(questionSetId: string, userId: string): Promise<{ revisionId: string; revisionNumber: number } | null> {
  // Check if revisions exist
  const { data: existingRevs } = await supabaseAdmin
    .from('question_set_revisions')
    .select('id')
    .eq('question_set_id', questionSetId)
    .limit(1);

  if (existingRevs && existingRevs.length > 0) {
    return null; // Skip - revisions exist
  }

  // Get question set to determine assessment type/version
  const { data: qs, error: qsError } = await supabaseAdmin
    .from('question_sets')
    .select('assessment_type, assessment_version')
    .eq('id', questionSetId)
    .single();

  if (qsError || !qs) {
    throw new Error('Question set not found');
  }

  // Create starter template based on v2 structure
  // Use the template but update assessmentType/version
  const starterContent = {
    ...questionsV2Template,
    assessmentType: qs.assessment_type,
    version: String(qs.assessment_version),
  };

  // Validate
  const validation = validateQuestionSet(starterContent);
  if (!validation.ok) {
    throw new Error(`Invalid starter template: ${validation.errors.join(', ')}`);
  }

  const content_hash = hashQuestionSetJson(validation.normalized!);

  // Create revision
  const { data: rev, error } = await supabaseAdmin
    .from('question_set_revisions')
    .insert({
      question_set_id: questionSetId,
      revision_number: 1,
      status: 'draft',
      schema_version: 'v2_question_schema_1',
      content_json: validation.normalized,
      content_hash,
      notes: 'Starter draft created by scaffold',
      created_by: userId,
    })
    .select('id, revision_number')
    .single();

  if (error) {
    throw new Error(`Failed to create question set draft: ${error.message}`);
  }

  return { revisionId: rev.id, revisionNumber: rev.revision_number };
}

/**
 * Create starter results pack draft
 */
async function createResultsPackDraft(packId: string, levelId: string, userId: string): Promise<{ revisionId: string; revisionNumber: number } | null> {
  // Check if revisions exist
  const { data: existingRevs } = await supabaseAdmin
    .from('results_pack_revisions')
    .select('id')
    .eq('pack_id', packId)
    .limit(1);

  if (existingRevs && existingRevs.length > 0) {
    return null; // Skip - revisions exist
  }

  // Create minimal valid starter template
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

  // Validate
  const validation = validateResultsPack(starterContent);
  if (!validation.ok) {
    throw new Error(`Invalid starter template for ${levelId}: ${validation.errors.join(', ')}`);
  }

  const content_hash = hashPackJson(validation.normalized!);

  // Create revision
  const { data: rev, error } = await supabaseAdmin
    .from('results_pack_revisions')
    .insert({
      pack_id: packId,
      revision_number: 1,
      status: 'draft',
      schema_version: 'v2_pack_schema_1',
      content_json: validation.normalized,
      content_hash,
      change_summary: 'Starter draft created by scaffold',
      created_by: userId,
    })
    .select('id, revision_number')
    .single();

  if (error) {
    throw new Error(`Failed to create results pack draft for ${levelId}: ${error.message}`);
  }

  return { revisionId: rev.id, revisionNumber: rev.revision_number };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ScaffoldDraftsResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { questionSetId, resultsPackIds } = req.body as ScaffoldDraftsRequest;

    if (!questionSetId && !resultsPackIds) {
      return res.status(400).json({ error: 'questionSetId or resultsPackIds required' });
    }

    const created: ScaffoldDraftsResponse['created'] = {};
    const skipped: ScaffoldDraftsResponse['skipped'] = {};

    // Create question set draft if provided
    if (questionSetId) {
      try {
        const draft = await createQuestionSetDraft(questionSetId, user.id);
        if (draft) {
          created.questionDraft = draft;
        } else {
          skipped.questionSet = true;
        }
      } catch (error) {
        console.error('Error creating question set draft:', error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to create question set draft',
        });
      }
    }

    // Create results pack drafts if provided
    if (resultsPackIds) {
      created.resultsDrafts = {};
      const skippedLevels: string[] = [];

      for (const [levelId, packId] of Object.entries(resultsPackIds)) {
        if (!packId) continue;

        try {
          const draft = await createResultsPackDraft(packId, levelId, user.id);
          if (draft) {
            created.resultsDrafts![levelId as keyof typeof created.resultsDrafts] = draft;
          } else {
            skippedLevels.push(levelId);
          }
        } catch (error) {
          console.error(`Error creating results pack draft for ${levelId}:`, error);
          return res.status(500).json({
            error: error instanceof Error ? error.message : `Failed to create results pack draft for ${levelId}`,
          });
        }
      }

      if (skippedLevels.length > 0) {
        skipped.resultsPacks = skippedLevels;
      }
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'assessments.scaffold_drafts',
        entity_type: 'assessment_scaffold',
        entity_id: null,
        metadata: {
          questionSetId,
          resultsPackIds,
          created,
          skipped,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    return res.status(200).json({ created, skipped });
  } catch (error) {
    console.error('Scaffold drafts error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

