/**
 * Maps flat validator error strings onto editor-field locations so the UI can
 * highlight the exact input that is wrong.
 *
 * The validator (`validateQuestionSet`) emits errors indexed against the
 * canonical v2 shape: a flat `questions[i]` array. The editor groups questions
 * inside sections, so we walk sections in order to build a flatIndex ->
 * {sectionIndex, questionIndex} map (matching `editorStateToQuestionSet`'s
 * emission order) and rewrite each error onto its editor field.
 */

import type { EditorState } from './editorTypes';

export interface OptionValidation {
  id: string[];
  label: string[];
  value: string[];
}

export interface QuestionValidation {
  id: string[];
  text: string[];
  options: string[]; // array-level / count errors
  missingValues: number[]; // values 0..3 not present
  optionsList: OptionValidation[];
}

export interface SectionValidation {
  id: string[];
  title: string[];
  questionIds: string[];
  questions: QuestionValidation[];
}

export interface ValidationView {
  top: {
    version: string[];
    assessmentType: string[];
    sections: string[];
    questions: string[];
    general: string[]; // errors not tied to a specific field
  };
  sections: SectionValidation[];
  unattached: string[]; // e.g. dangling section references
}

function emptyOption(): OptionValidation {
  return { id: [], label: [], value: [] };
}

function emptyQuestion(optionCount: number): QuestionValidation {
  return {
    id: [],
    text: [],
    options: [],
    missingValues: [],
    optionsList: Array.from({ length: optionCount }, emptyOption),
  };
}

function emptySection(optionCounts: number[]): SectionValidation {
  return {
    id: [],
    title: [],
    questionIds: [],
    questions: optionCounts.map((n) => emptyQuestion(n)),
  };
}

/**
 * Build a ValidationView sized to the given editor state.
 */
export function buildValidationView(state: EditorState): ValidationView {
  const sections: SectionValidation[] = state.sections.map((section) => {
    const optionCounts = section.questions.map((q) => q.options.length);
    return emptySection(optionCounts);
  });

  return {
    top: { version: [], assessmentType: [], sections: [], questions: [], general: [] },
    sections,
    unattached: [],
  };
}

interface FlatQuestionLoc {
  sectionIndex: number;
  questionIndex: number;
}

function buildFlatIndex(state: EditorState): FlatQuestionLoc[] {
  const index: FlatQuestionLoc[] = [];
  state.sections.forEach((section, si) => {
    section.questions.forEach((_q, qi) => {
      index.push({ sectionIndex: si, questionIndex: qi });
    });
  });
  return index;
}

const RE = {
  sectionId: /^sections\[(\d+)\]\.id must be a non-empty string\.$/,
  sectionIdDup: /^sections\[(\d+)\]\.id ".*" is duplicate\.$/,
  sectionTitle: /^sections\[(\d+)\]\.title must be a non-empty string\.$/,
  sectionQuestionIds: /^sections\[(\d+)\]\.questionIds must be (?:an array|non-empty)\.$/,
  sectionObject: /^sections\[(\d+)\] must be an object\.$/,
  questionObject: /^questions\[(\d+)\] must be an object\.$/,
  questionId: /^questions\[(\d+)\]\.id must be a non-empty string\.$/,
  questionIdDup: /^questions\[(\d+)\]\.id ".*" is duplicate\.$/,
  questionText: /^questions\[(\d+)\]\.text must be a non-empty string\.$/,
  questionOptionsArray: /^questions\[(\d+)\]\.options must be an array\.$/,
  questionOptionsCount: /^questions\[(\d+)\]\.options must have exactly 4 options, got \d+\.$/,
  optionObject: /^questions\[(\d+)\]\.options\[(\d+)\] must be an object\.$/,
  optionId: /^questions\[(\d+)\]\.options\[(\d+)\]\.id must be a non-empty string\.$/,
  optionIdDup: /^questions\[(\d+)\]\.options\[(\d+)\]\.id ".*" is duplicate within question\.$/,
  optionLabel: /^questions\[(\d+)\]\.options\[(\d+)\]\.label must be a non-empty string\.$/,
  optionValueNumber: /^questions\[(\d+)\]\.options\[(\d+)\]\.value must be a number\.$/,
  optionValueRange: /^questions\[(\d+)\]\.options\[(\d+)\]\.value must be one of \{0,1,2,3\}, got .*\.$/,
  optionValueDup: /^questions\[(\d+)\]\.options\[(\d+)\]\.value \d+ is duplicate within question\.$/,
  questionMissingValue: /^questions\[(\d+)\] is missing option with value (\d+)\.$/,
  danglingRef: /^Section references question\.id ".*" which does not exist\.$/,
};

/**
 * Project a list of validator error strings onto a ValidationView sized to
 * `state`. Errors that do not match a known field fall through to
 * `top.general` / `unattached` so nothing is silently lost.
 */
export function projectErrors(state: EditorState, errors: string[]): ValidationView {
  const view = buildValidationView(state);
  const flatIndex = buildFlatIndex(state);

  const ensureOption = (si: number, qi: number, oi: number): OptionValidation => {
    const q = view.sections[si]?.questions[qi];
    if (!q) return emptyOption();
    while (q.optionsList.length <= oi) q.optionsList.push(emptyOption());
    return q.optionsList[oi];
  };

  for (const msg of errors) {
    let m: RegExpMatchArray | null;

    if ((m = RE.sectionId.exec(msg)) || (m = RE.sectionIdDup.exec(msg))) {
      const si = Number(m![1]);
      view.sections[si]?.id.push(msg);
      continue;
    }
    if ((m = RE.sectionTitle.exec(msg))) {
      const si = Number(m![1]);
      view.sections[si]?.title.push(msg);
      continue;
    }
    if ((m = RE.sectionQuestionIds.exec(msg))) {
      const si = Number(m![1]);
      view.sections[si]?.questionIds.push(msg);
      continue;
    }
    if ((m = RE.sectionObject.exec(msg))) {
      const si = Number(m![1]);
      view.sections[si]?.id.push(msg);
      continue;
    }
    if ((m = RE.questionObject.exec(msg))) {
      const fi = Number(m![1]);
      const loc = flatIndex[fi];
      if (loc) view.sections[loc.sectionIndex]?.questions[loc.questionIndex]?.id.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if ((m = RE.questionId.exec(msg)) || (m = RE.questionIdDup.exec(msg))) {
      const fi = Number(m![1]);
      const loc = flatIndex[fi];
      if (loc) view.sections[loc.sectionIndex]?.questions[loc.questionIndex]?.id.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if ((m = RE.questionText.exec(msg))) {
      const fi = Number(m![1]);
      const loc = flatIndex[fi];
      if (loc) view.sections[loc.sectionIndex]?.questions[loc.questionIndex]?.text.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if ((m = RE.questionOptionsArray.exec(msg)) || (m = RE.questionOptionsCount.exec(msg))) {
      const fi = Number(m![1]);
      const loc = flatIndex[fi];
      if (loc) view.sections[loc.sectionIndex]?.questions[loc.questionIndex]?.options.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if ((m = RE.optionObject.exec(msg))) {
      const fi = Number(m![1]);
      const oi = Number(m![2]);
      const loc = flatIndex[fi];
      if (loc) ensureOption(loc.sectionIndex, loc.questionIndex, oi).id.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if ((m = RE.optionId.exec(msg)) || (m = RE.optionIdDup.exec(msg))) {
      const fi = Number(m![1]);
      const oi = Number(m![2]);
      const loc = flatIndex[fi];
      if (loc) ensureOption(loc.sectionIndex, loc.questionIndex, oi).id.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if ((m = RE.optionLabel.exec(msg))) {
      const fi = Number(m![1]);
      const oi = Number(m![2]);
      const loc = flatIndex[fi];
      if (loc) ensureOption(loc.sectionIndex, loc.questionIndex, oi).label.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if (
      (m = RE.optionValueNumber.exec(msg)) ||
      (m = RE.optionValueRange.exec(msg)) ||
      (m = RE.optionValueDup.exec(msg))
    ) {
      const fi = Number(m![1]);
      const oi = Number(m![2]);
      const loc = flatIndex[fi];
      if (loc) ensureOption(loc.sectionIndex, loc.questionIndex, oi).value.push(msg);
      else view.top.general.push(msg);
      continue;
    }
    if ((m = RE.questionMissingValue.exec(msg))) {
      const fi = Number(m![1]);
      const val = Number(m![2]);
      const loc = flatIndex[fi];
      if (loc) {
        const q = view.sections[loc.sectionIndex]?.questions[loc.questionIndex];
        if (q) q.missingValues.push(val);
      }
      view.top.general.push(msg);
      continue;
    }
    if (RE.danglingRef.test(msg)) {
      view.unattached.push(msg);
      continue;
    }

    // Top-level / fallthrough
    if (msg.startsWith('version must be')) view.top.version.push(msg);
    else if (msg.startsWith('assessmentType must be')) view.top.assessmentType.push(msg);
    else if (msg === 'sections must be an array.' || msg === 'sections array must be non-empty.')
      view.top.sections.push(msg);
    else if (msg === 'questions must be an array.' || msg === 'questions array must be non-empty.')
      view.top.questions.push(msg);
    else view.top.general.push(msg);
  }

  return view;
}
