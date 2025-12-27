/**
 * API Route: Import Question Set from CSV
 * 
 * POST /api/admin/question-sets/import-csv
 * 
 * Allows admin/editor users to upload CSV files and create a draft question set revision.
 * Accepts multipart/form-data with four CSV files: meta, sections, questions, options.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { validateQuestionSet, hashQuestionSetJson } from '@/lib/questionSet/validateQuestionSet';
import { parseCSV } from '@/lib/questionSet/csvParser';
import { buildQuestionSetFromCSV } from '@/lib/questionSet/csvToQuestionSet';
import formidable from 'formidable';
import type { File as FormidableFile } from 'formidable';
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

// Disable Next.js body parser for this route (we handle multipart/form-data)
export const config = {
  api: {
    bodyParser: false,
  },
};

interface ImportCSVSuccessResponse {
  ok: true;
  questionSetId: string;
  revisionId: string;
  revisionNumber: number;
  previewUrl: string;
}

interface ImportCSVErrorResponse {
  ok: false;
  errors: Array<{
    file: string;
    row: number;
    column?: string;
    message: string;
  }>;
}

type ImportCSVResponse = ImportCSVSuccessResponse | ImportCSVErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ImportCSVResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB max file size
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    // Extract file objects from formidable result
    const metaFile = Array.isArray(files.meta) ? files.meta[0] : (files.meta as FormidableFile | undefined);
    const sectionsFile = Array.isArray(files.sections) ? files.sections[0] : (files.sections as FormidableFile | undefined);
    const questionsFile = Array.isArray(files.questions) ? files.questions[0] : (files.questions as FormidableFile | undefined);
    const optionsFile = Array.isArray(files.options) ? files.options[0] : (files.options as FormidableFile | undefined);

    // Validate all files are present
    if (!metaFile || !sectionsFile || !questionsFile || !optionsFile) {
      return res.status(400).json({
        ok: false,
        errors: [
          {
            file: 'request',
            row: 0,
            message: 'All four CSV files are required: meta, sections, questions, options',
          },
        ],
      });
    }

    // Read CSV files
    const metaContent = await readFile(metaFile.filepath, 'utf-8');
    const sectionsContent = await readFile(sectionsFile.filepath, 'utf-8');
    const questionsContent = await readFile(questionsFile.filepath, 'utf-8');
    const optionsContent = await readFile(optionsFile.filepath, 'utf-8');

    // Parse CSV files
    const metaParse = parseCSV(metaContent, 'meta.csv', ['key', 'value']);
    const sectionsParse = parseCSV(sectionsContent, 'sections.csv', ['section_id', 'title', 'order']);
    const questionsParse = parseCSV(questionsContent, 'questions.csv', ['question_id', 'section_id', 'text', 'order']);
    const optionsParse = parseCSV(optionsContent, 'options.csv', ['question_id', 'option_id', 'label', 'value']);

    // Collect all parsing errors
    const parseErrors = [
      ...metaParse.errors,
      ...sectionsParse.errors,
      ...questionsParse.errors,
      ...optionsParse.errors,
    ];

    if (parseErrors.length > 0) {
      // Clean up uploaded files
      [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
        if (file?.filepath) {
          fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
        }
      });

      return res.status(400).json({
        ok: false,
        errors: parseErrors,
      });
    }

    // Build QuestionSet JSON from CSV data
    const buildResult = buildQuestionSetFromCSV(
      metaParse.rows,
      sectionsParse.rows,
      questionsParse.rows,
      optionsParse.rows
    );

    if (buildResult.errors.length > 0) {
      // Clean up uploaded files
      [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
        if (file?.filepath) {
          fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
        }
      });

      return res.status(400).json({
        ok: false,
        errors: buildResult.errors,
      });
    }

    if (!buildResult.questionSet) {
      // Clean up uploaded files
      [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
        if (file?.filepath) {
          fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
        }
      });

      return res.status(500).json({
        error: 'Failed to build question set from CSV',
      });
    }

    // Extract metadata for question set identity (buildResult.questionSet already validated this)
    // But we need the raw values for DB insert, so extract from parsed rows
    const metaObj: Record<string, string> = {};
    for (const row of metaParse.rows) {
      const key = typeof row.key === 'string' ? row.key.trim() : '';
      const value = typeof row.value === 'string' ? row.value.trim() : '';
      if (key) {
        metaObj[key] = value;
      }
    }
    const assessmentType = metaObj.assessmentType || buildResult.questionSet.assessmentType;
    const assessmentVersion = metaObj.assessmentVersion || '';
    const locale = metaObj.locale?.trim() || null;
    const notes = metaObj.notes?.trim() || null;

    // Validate question set structure
    const validation = validateQuestionSet(buildResult.questionSet);
    if (!validation.ok) {
      // Convert validation errors to CSV error format
      const validationErrors = validation.errors.map((error) => ({
        file: 'validation',
        row: 0,
        message: error,
      }));

      // Clean up uploaded files
      [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
        if (file?.filepath) {
          fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
        }
      });

      return res.status(400).json({
        ok: false,
        errors: validationErrors,
      });
    }

    const content_hash = hashQuestionSetJson(validation.normalized);

    // Find or create question set identity
    const insertData: { assessment_type: string; assessment_version: string; locale?: string | null } = {
      assessment_type: assessmentType,
      assessment_version: assessmentVersion,
      locale: locale === null || locale === '' ? null : locale,
    };

    // First, try to find existing question set
    let query = supabaseAdmin
      .from('question_sets')
      .select('id')
      .eq('assessment_type', assessmentType)
      .eq('assessment_version', assessmentVersion);
    
    // Handle NULL locale correctly - use .is() for NULL, .eq() for non-NULL
    if (insertData.locale === null) {
      query = query.is('locale', null);
    } else {
      query = query.eq('locale', insertData.locale);
    }
    
    const { data: existingSet } = await query.maybeSingle();

    let questionSetId: string;
    if (existingSet) {
      questionSetId = existingSet.id;
    } else {
      // Insert new question set
      const { data: newSet, error: insertError } = await supabaseAdmin
        .from('question_sets')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError || !newSet) {
        // Clean up uploaded files
        [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
          if (file?.filepath) {
            fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
          }
        });

        console.error('Error creating question set:', insertError);
        return res.status(500).json({
          error: insertError?.message || 'Failed to create question set identity',
        });
      }
      questionSetId = newSet.id;
    }

    // Use the questionSetId for the rest of the operation
    const questionSet = { id: questionSetId };

    // Compute next revision number
    const { data: lastRev } = await supabaseAdmin
      .from('question_set_revisions')
      .select('revision_number')
      .eq('question_set_id', questionSet.id)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextRevNumber = (lastRev?.revision_number ?? 0) + 1;

    // Insert draft revision
    const { data: revision, error: revisionError } = await supabaseAdmin
      .from('question_set_revisions')
      .insert({
        question_set_id: questionSet.id,
        revision_number: nextRevNumber,
        status: 'draft',
        schema_version: 'v2_question_schema_1',
        content_json: validation.normalized,
        content_hash,
        notes: notes,
        validation_errors: null,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (revisionError) {
      // Check for duplicate revision number (race condition)
      if (revisionError.code === '23505') {
        // Retry with next number
        const { data: lastRevRetry } = await supabaseAdmin
          .from('question_set_revisions')
          .select('revision_number')
          .eq('question_set_id', questionSet.id)
          .order('revision_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const retryRevNumber = (lastRevRetry?.revision_number ?? 0) + 1;

        const { data: revisionRetry, error: retryError } = await supabaseAdmin
          .from('question_set_revisions')
          .insert({
            question_set_id: questionSet.id,
            revision_number: retryRevNumber,
            status: 'draft',
            schema_version: 'v2_question_schema_1',
            content_json: validation.normalized,
            content_hash,
            notes: notes,
            validation_errors: null,
            created_by: user.id,
          })
          .select('*')
          .single();

        if (retryError || !revisionRetry) {
          // Clean up uploaded files
          [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
            if (file?.filepath) {
              fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
            }
          });

          console.error('Error creating revision (retry):', retryError);
          return res.status(500).json({
            error: retryError?.message || 'Failed to create revision',
          });
        }

        // Log to audit log
        try {
          await supabaseAdmin.from('content_audit_log').insert({
            actor_id: user.id,
            action: 'questions.import_csv',
            entity_type: 'question_set',
            entity_id: questionSet.id,
            metadata: {
              assessment_type: assessmentType,
              assessment_version: assessmentVersion,
              locale: insertData.locale,
              revision_id: revisionRetry.id,
              revision_number: retryRevNumber,
              section_count: buildResult.questionSet.sections.length,
              question_count: buildResult.questionSet.questions.length,
            },
          });
        } catch (auditError) {
          console.warn('Failed to write audit log:', auditError);
        }

        // Clean up uploaded files
        [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
          if (file?.filepath) {
            fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
          }
        });

        const previewUrl = `/api/question-sets/resolve?assessmentType=${encodeURIComponent(assessmentType)}&assessmentVersion=${encodeURIComponent(assessmentVersion)}${locale ? `&locale=${encodeURIComponent(locale)}` : ''}&preview=1`;

        return res.status(200).json({
          ok: true,
          questionSetId: questionSet.id,
          revisionId: revisionRetry.id,
          revisionNumber: retryRevNumber,
          previewUrl,
        });
      }

      // Clean up uploaded files
      [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
        if (file?.filepath) {
          fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
        }
      });

      console.error('Error creating revision:', revisionError);
      return res.status(500).json({
        error: revisionError.message,
      });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'questions.import_csv',
        entity_type: 'question_set',
        entity_id: questionSet.id,
        metadata: {
          assessment_type: assessmentType,
          assessment_version: assessmentVersion,
          locale: insertData.locale,
          revision_id: revision.id,
          revision_number: nextRevNumber,
          section_count: buildResult.questionSet.sections.length,
          question_count: buildResult.questionSet.questions.length,
        },
      });
    } catch (auditError) {
      console.warn('Failed to write audit log:', auditError);
    }

    // Clean up uploaded files
    [metaFile, sectionsFile, questionsFile, optionsFile].forEach((file) => {
      if (file?.filepath) {
        fs.unlink(file.filepath, () => {}); // Non-blocking cleanup
      }
    });

    const previewUrl = `/api/question-sets/resolve?assessmentType=${encodeURIComponent(assessmentType)}&assessmentVersion=${encodeURIComponent(assessmentVersion)}${locale ? `&locale=${encodeURIComponent(locale)}` : ''}&preview=1`;

    return res.status(200).json({
      ok: true,
      questionSetId: questionSet.id,
      revisionId: revision.id,
      revisionNumber: nextRevNumber,
      previewUrl,
    });
  } catch (error) {
    console.error('Import CSV error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

