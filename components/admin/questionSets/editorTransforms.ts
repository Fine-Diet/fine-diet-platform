/**
 * Pure transforms between editor state and the canonical v2 QuestionSet JSON,
 * plus factory helpers for new sections/questions/options and id generation.
 */

import type { QuestionSet } from '@/lib/questionSet/validateQuestionSetShared';
import type {
  EditorOption,
  EditorQuestion,
  EditorSection,
  EditorState,
} from './editorTypes';

const STARTER_VERSION = '2';
const STARTER_ASSESSMENT_TYPE = 'gut-check';

/**
 * Browser-safe unique id. Uses crypto.randomUUID when available, falls back to
 * a prefix + random + counter string that is unique within a session.
 */
export function genId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}

export function createBlankOption(index: number): EditorOption {
  return {
    id: genId('o'),
    label: '',
    value: clampValue(index),
  };
}

export function createBlankQuestion(): EditorQuestion {
  return {
    id: genId('q'),
    text: '',
    options: [0, 1, 2, 3].map((value) => ({
      id: genId('o'),
      label: '',
      value,
    })),
  };
}

export function createBlankSection(): EditorSection {
  return {
    id: genId('s'),
    title: '',
    questions: [createBlankQuestion()],
  };
}

/**
 * Default editor state used when there is no existing revision to load.
 */
export function createBlankEditorState(): EditorState {
  return {
    version: STARTER_VERSION,
    assessmentType: STARTER_ASSESSMENT_TYPE,
    sections: [createBlankSection()],
  };
}

function clampValue(n: number): number {
  if (n >= 0 && n <= 3 && Number.isInteger(n)) return n;
  return 0;
}

/**
 * Convert editor state to the canonical v2 QuestionSet: sections reference
 * their questions by id, and questions are emitted as a flat array in
 * section order.
 */
export function editorStateToQuestionSet(state: EditorState): QuestionSet {
  const sections: QuestionSet['sections'] = state.sections.map((section) => ({
    id: section.id,
    title: section.title,
    questionIds: section.questions.map((q) => q.id),
  }));

  const questions: QuestionSet['questions'] = state.sections.flatMap(
    (section) =>
      section.questions.map((q) => ({
        id: q.id,
        text: q.text,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
        })),
      })),
  );

  return {
    version: state.version,
    assessmentType: state.assessmentType,
    sections,
    questions,
  };
}

/**
 * Convert a canonical v2 QuestionSet into editor state by grouping questions
 * under their referencing section. Any question not referenced by a section is
 * dropped (the validator rejects such sets anyway); any dangling section
 * reference is preserved as an empty placeholder question via the caller's
 * validation pass.
 */
export function questionSetToEditorState(qs: QuestionSet): EditorState {
  const questionsById = new Map<string, QuestionSet['questions'][number]>();
  for (const q of qs.questions ?? []) {
    if (q && typeof q.id === 'string') questionsById.set(q.id, q);
  }

  const sections: EditorSection[] = (qs.sections ?? []).map((section) => ({
    id: section.id,
    title: section.title,
    questions: (section.questionIds ?? [])
      .map((qid) => questionsById.get(qid))
      .filter((q): q is QuestionSet['questions'][number] => Boolean(q))
      .map((q) => ({
        id: q.id,
        text: q.text,
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
        })),
      })),
  }));

  return {
    version: qs.version ?? STARTER_VERSION,
    assessmentType: qs.assessmentType ?? STARTER_ASSESSMENT_TYPE,
    sections,
  };
}

/**
 * Deep-ish clone of an editor question with a fresh id and fresh option ids.
 * Used by the "duplicate question" action.
 */
export function duplicateQuestion(q: EditorQuestion): EditorQuestion {
  return {
    id: genId('q'),
    text: q.text,
    options: q.options.map((o) => ({ ...o, id: genId('o') })),
  };
}

export function duplicateSection(s: EditorSection): EditorSection {
  return {
    id: genId('s'),
    title: s.title,
    questions: s.questions.map(duplicateQuestion),
  };
}
