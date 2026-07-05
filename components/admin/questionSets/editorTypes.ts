/**
 * Editor state shapes for the structured question-set authoring UI.
 *
 * The canonical v2 QuestionSet stores questions as a flat array and sections
 * as a separate array of `questionIds`. The editor models sections as
 * containers holding their questions inline, which makes add/remove/reorder
 * natural; `editorTransforms` converts between the two shapes.
 */

export interface EditorOption {
  id: string;
  label: string;
  value: number;
}

export interface EditorQuestion {
  id: string;
  text: string;
  options: EditorOption[];
}

export interface EditorSection {
  id: string;
  title: string;
  questions: EditorQuestion[];
}

export interface EditorState {
  version: string;
  assessmentType: string;
  sections: EditorSection[];
}

export type EditorMode = 'structured' | 'json';
