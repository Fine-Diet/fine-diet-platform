/**
 * API Route: Import Question Set from CSV
 *
 * POST /api/admin/question-sets/import-csv
 *
 * Allows admin/editor users to upload CSV files and create a draft question set
 * revision. Accepts multipart/form-data with four CSV files: meta, sections,
 * questions, options.
 *
 * Persistence is delegated to the shared save service
 * (lib/questionSet/saveQuestionSetRevision) so CSV import and direct JSON
 * authoring produce identical immutable revision records, content hashes, and
 * audit-log entries. CSV-specific parsing/build errors keep their file/row
 * shape; validation and duplicate outcomes from the shared service are mapped
 * onto the same CSV error envelope so existing admin tooling keeps working.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { parseCSV } from '@/lib/questionSet/csvParser';
import { buildQuestionSetFromCSV } from '@/lib/questionSet/csvToQuestionSet';
import { saveQuestionSetRevision } from '@/lib/questionSet/saveQuestionSetRevision';
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

interface CsvError {
  file: string;
  row: number;
  column?: string;
  message: string;
}

interface ImportCSVSuccessResponse {
  ok: true;
  questionSetId: string;
  revisionId: string;
  revisionNumber: number;
  previewUrl: string;
}

interface ImportCSVErrorResponse {
  ok: false;
  errors: CsvError[];
}

type ImportCSVResponse = ImportCSVSuccessResponse | ImportCSVErrorResponse;

function cleanupFiles(files: (FormidableFile | undefined)[]) {
  files.forEach((file) => {
    if (file?.filepath) {
      fs.unlink(file.filepath, () => {});
    }
  });
}

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

  const uploadedFiles: (FormidableFile | undefined)[] = [];

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB max file size
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const metaFile = Array.isArray(files.meta) ? files.meta[0] : (files.meta as FormidableFile | undefined);
    const sectionsFile = Array.isArray(files.sections) ? files.sections[0] : (files.sections as FormidableFile | undefined);
    const questionsFile = Array.isArray(files.questions) ? files.questions[0] : (files.questions as FormidableFile | undefined);
    const optionsFile = Array.isArray(files.options) ? files.options[0] : (files.options as FormidableFile | undefined);

    uploadedFiles.push(metaFile, sectionsFile, questionsFile, optionsFile);

    if (!metaFile || !sectionsFile || !questionsFile || !optionsFile) {
      cleanupFiles(uploadedFiles);
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

    const metaContent = await readFile(metaFile.filepath, 'utf-8');
    const sectionsContent = await readFile(sectionsFile.filepath, 'utf-8');
    const questionsContent = await readFile(questionsFile.filepath, 'utf-8');
    const optionsContent = await readFile(optionsFile.filepath, 'utf-8');

    const metaParse = parseCSV(metaContent, 'meta.csv', ['key', 'value']);
    const sectionsParse = parseCSV(sectionsContent, 'sections.csv', ['section_id', 'title', 'order']);
    const questionsParse = parseCSV(questionsContent, 'questions.csv', ['question_id', 'section_id', 'text', 'order']);
    const optionsParse = parseCSV(optionsContent, 'options.csv', ['question_id', 'option_id', 'label', 'value']);

    const parseErrors = [
      ...metaParse.errors,
      ...sectionsParse.errors,
      ...questionsParse.errors,
      ...optionsParse.errors,
    ];

    if (parseErrors.length > 0) {
      cleanupFiles(uploadedFiles);
      return res.status(400).json({ ok: false, errors: parseErrors });
    }

    const buildResult = buildQuestionSetFromCSV(
      metaParse.rows,
      sectionsParse.rows,
      questionsParse.rows,
      optionsParse.rows
    );

    if (buildResult.errors.length > 0) {
      cleanupFiles(uploadedFiles);
      return res.status(400).json({ ok: false, errors: buildResult.errors });
    }

    if (!buildResult.questionSet) {
      cleanupFiles(uploadedFiles);
      return res.status(500).json({ error: 'Failed to build question set from CSV' });
    }

    // Identity metadata comes from meta.csv (the question set JSON itself does
    // not carry version/locale).
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

    // Persist via the shared save service (CSV import does not auto-set preview).
    const result = await saveQuestionSetRevision({
      questionSetJson: buildResult.questionSet,
      assessmentType,
      assessmentVersion,
      locale,
      notes,
      setPreview: false,
      actorId: user.id,
      auditAction: 'questions.import_csv',
    });

    cleanupFiles(uploadedFiles);

    if (!result.ok) {
      if (result.kind === 'validation') {
        const validationErrors: CsvError[] = result.errors.map((message) => ({
          file: 'validation',
          row: 0,
          message,
        }));
        return res.status(400).json({ ok: false, errors: validationErrors });
      }
      return res.status(500).json({ error: result.error });
    }

    if (result.kind === 'duplicate') {
      return res.status(400).json({
        ok: false,
        errors: [
          {
            file: 'meta.csv',
            row: 1,
            column: 'content',
            message: `This content already exists as revision #${result.revision.revisionNumber}. No changes were detected.`,
          },
        ],
      });
    }

    return res.status(200).json({
      ok: true,
      questionSetId: result.revision.questionSetId,
      revisionId: result.revision.revisionId,
      revisionNumber: result.revision.revisionNumber,
      previewUrl: result.previewUrl,
    });
  } catch (error) {
    cleanupFiles(uploadedFiles);
    console.error('Import CSV error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
