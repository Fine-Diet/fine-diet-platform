/**
 * CSV to Question Set JSON Builder
 * 
 * Converts parsed CSV data into canonical Questions JSON v2 structure
 */

import type { ParsedCSVRow } from './csvParser';
import type { CSVParseError } from './csvParser';
import type { QuestionSet } from './validateQuestionSet';

export interface BuildQuestionSetResult {
  questionSet?: QuestionSet;
  errors: CSVParseError[];
}

interface MetaRow {
  key: string;
  value: string;
}

interface SectionRow {
  section_id: string;
  title: string;
  order: string;
}

interface QuestionRow {
  question_id: string;
  section_id: string;
  text: string;
  order: string;
}

interface OptionRow {
  question_id: string;
  option_id: string;
  label: string;
  value: string;
}

/**
 * Build QuestionSet JSON from parsed CSV rows
 */
export function buildQuestionSetFromCSV(
  metaRows: ParsedCSVRow[],
  sectionRows: ParsedCSVRow[],
  questionRows: ParsedCSVRow[],
  optionRows: ParsedCSVRow[]
): BuildQuestionSetResult {
  const errors: CSVParseError[] = [];

  // Validate meta.csv (must have at least required keys)
  if (metaRows.length === 0) {
    errors.push({
      file: 'meta.csv',
      row: 0,
      message: 'meta.csv must have at least one data row',
    });
    return { errors };
  }

  // Build meta object from key-value pairs
  const meta: Record<string, string> = {};
  for (const row of metaRows) {
    const key = row.key?.trim();
    const value = row.value?.trim();
    if (key) {
      meta[key] = value;
    }
  }

  // Extract required meta fields
  const version = meta.version?.trim();
  const assessmentType = meta.assessmentType?.trim();
  const assessmentVersion = meta.assessmentVersion?.trim();
  const locale = meta.locale?.trim() || null;
  const notes = meta.notes?.trim() || null;

  // Validate required meta fields (find the row with each key for error reporting)
  const versionRow = metaRows.find((r) => r.key?.trim() === 'version');
  if (!version || version !== '2') {
    errors.push({
      file: 'meta.csv',
      row: versionRow?.__rowNumber || metaRows[0].__rowNumber,
      column: 'value',
      message: `version must be "2", got "${version || 'empty'}"`,
    });
  }

  const assessmentTypeRow = metaRows.find((r) => r.key?.trim() === 'assessmentType');
  if (!assessmentType) {
    errors.push({
      file: 'meta.csv',
      row: assessmentTypeRow?.__rowNumber || metaRows[0].__rowNumber,
      column: 'value',
      message: 'assessmentType is required',
    });
  }

  const assessmentVersionRow = metaRows.find((r) => r.key?.trim() === 'assessmentVersion');
  if (!assessmentVersion) {
    errors.push({
      file: 'meta.csv',
      row: assessmentVersionRow?.__rowNumber || metaRows[0].__rowNumber,
      column: 'value',
      message: 'assessmentVersion is required',
    });
  }

  if (errors.length > 0) {
    return { errors };
  }

  // Parse sections (sort by order)
  const sections = sectionRows
    .map((row) => {
      const order = parseFloat(row.order);
      if (isNaN(order)) {
        errors.push({
          file: 'sections.csv',
          row: row.__rowNumber,
          column: 'order',
          message: `order must be numeric, got "${row.order}"`,
        });
        return null;
      }
      return {
        row,
        section_id: row.section_id.trim(),
        title: row.title.trim(),
        order,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.order - b.order);

  // Check for duplicate section_ids
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (sectionIds.has(section.section_id)) {
      errors.push({
        file: 'sections.csv',
        row: section.row.__rowNumber,
        column: 'section_id',
        message: `Duplicate section_id: "${section.section_id}"`,
      });
    }
    sectionIds.add(section.section_id);
  }

  // Parse questions (group by section_id, sort by order within section)
  const questionsBySection = new Map<string, Array<{ row: ParsedCSVRow; question_id: string; text: string; order: number }>>();

  for (const row of questionRows) {
    const question_id = row.question_id.trim();
    const section_id = row.section_id.trim();
    const text = row.text.trim();
    const order = parseFloat(row.order);

    if (isNaN(order)) {
      errors.push({
        file: 'questions.csv',
        row: row.__rowNumber,
        column: 'order',
        message: `order must be numeric, got "${row.order}"`,
      });
      continue;
    }

    // Validate section_id exists
    if (!sectionIds.has(section_id)) {
      errors.push({
        file: 'questions.csv',
        row: row.__rowNumber,
        column: 'section_id',
        message: `section_id "${section_id}" does not exist in sections.csv`,
      });
      continue;
    }

    if (!questionsBySection.has(section_id)) {
      questionsBySection.set(section_id, []);
    }

    questionsBySection.get(section_id)!.push({
      row,
      question_id,
      text,
      order,
    });
  }

  // Sort questions within each section by order
  for (const [sectionId, questions] of questionsBySection.entries()) {
    questions.sort((a, b) => a.order - b.order);
  }

  // Check for duplicate question_ids
  const questionIds = new Set<string>();
  for (const questions of questionsBySection.values()) {
    for (const q of questions) {
      if (questionIds.has(q.question_id)) {
        errors.push({
          file: 'questions.csv',
          row: q.row.__rowNumber,
          column: 'question_id',
          message: `Duplicate question_id: "${q.question_id}"`,
        });
      }
      questionIds.add(q.question_id);
    }
  }

  // Parse options (group by question_id)
  const optionsByQuestion = new Map<string, Array<{ row: ParsedCSVRow; option_id: string; label: string; value: number }>>();

  for (const row of optionRows) {
    const question_id = row.question_id.trim();
    const option_id = row.option_id.trim();
    const label = row.label.trim();
    const valueStr = row.value.trim();
    const value = parseInt(valueStr, 10);

    if (isNaN(value) || ![0, 1, 2, 3].includes(value)) {
      errors.push({
        file: 'options.csv',
        row: row.__rowNumber,
        column: 'value',
        message: `value must be one of {0,1,2,3}, got "${valueStr}"`,
      });
      continue;
    }

    // Validate question_id exists
    if (!questionIds.has(question_id)) {
      errors.push({
        file: 'options.csv',
        row: row.__rowNumber,
        column: 'question_id',
        message: `question_id "${question_id}" does not exist in questions.csv`,
      });
      continue;
    }

    if (!optionsByQuestion.has(question_id)) {
      optionsByQuestion.set(question_id, []);
    }

    optionsByQuestion.get(question_id)!.push({
      row,
      option_id,
      label,
      value,
    });
  }

  // Validate options: exactly 4 per question, values 0-3 exactly once
  for (const [question_id, options] of optionsByQuestion.entries()) {
    if (options.length !== 4) {
      const firstRow = options[0]?.row.__rowNumber || 0;
      errors.push({
        file: 'options.csv',
        row: firstRow,
        column: 'question_id',
        message: `Question "${question_id}" must have exactly 4 options, got ${options.length}`,
      });
      continue;
    }

    // Check for duplicate option_ids within question
    const optionIds = new Set<string>();
    for (const opt of options) {
      if (optionIds.has(opt.option_id)) {
        errors.push({
          file: 'options.csv',
          row: opt.row.__rowNumber,
          column: 'option_id',
          message: `Duplicate option_id "${opt.option_id}" within question "${question_id}"`,
        });
      }
      optionIds.add(opt.option_id);
    }

    // Check values are {0,1,2,3} exactly once
    const values = options.map((opt) => opt.value);
    const expectedValues = [0, 1, 2, 3];
    for (const expectedValue of expectedValues) {
      const count = values.filter((v) => v === expectedValue).length;
      if (count === 0) {
        const firstRow = options[0]?.row.__rowNumber || 0;
        errors.push({
          file: 'options.csv',
          row: firstRow,
          column: 'value',
          message: `Question "${question_id}" is missing option with value ${expectedValue}`,
        });
      } else if (count > 1) {
        const duplicateRows = options.filter((opt) => opt.value === expectedValue);
        errors.push({
          file: 'options.csv',
          row: duplicateRows[1]?.row.__rowNumber || 0,
          column: 'value',
          message: `Question "${question_id}" has duplicate value ${expectedValue}`,
        });
      }
    }
  }

  // If there are errors, return early
  if (errors.length > 0) {
    return { errors };
  }

  // Build QuestionSet structure
  const questionSetSections = sections.map((section) => {
    const questionsInSection = questionsBySection.get(section.section_id) || [];
    return {
      id: section.section_id,
      title: section.title,
      questionIds: questionsInSection.map((q) => q.question_id),
    };
  });

  const questionSetQuestions = Array.from(questionIds).map((question_id) => {
    const options = (optionsByQuestion.get(question_id) || []).sort((a, b) => a.value - b.value);
    // Find question text from questionsBySection
    let questionText = '';
    for (const questions of questionsBySection.values()) {
      const q = questions.find((q) => q.question_id === question_id);
      if (q) {
        questionText = q.text;
        break;
      }
    }

    return {
      id: question_id,
      text: questionText,
      options: options.map((opt) => ({
        id: opt.option_id,
        label: opt.label,
        value: opt.value,
      })),
    };
  });

  const questionSet: QuestionSet = {
    version: '2',
    assessmentType: assessmentType!,
    sections: questionSetSections,
    questions: questionSetQuestions,
  };

  return { questionSet, errors: [] };
}

