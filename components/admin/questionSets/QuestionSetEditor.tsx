/**
 * Structured question-set editor with a JSON-advanced mode toggle.
 *
 * Controlled: the page owns the editor state (so it can save it) and the
 * computed ValidationView. This component renders either the structured
 * section/question/option cards or a raw JSON textarea, and keeps both views
 * in sync with the single source of truth in parent state.
 *
 * In JSON mode, edits are parsed on each change; a successful parse updates
 * parent state immediately, a parse failure shows an inline error and leaves
 * parent state untouched.
 */

import { useMemo, useState } from 'react';
import type { EditorState, EditorMode, EditorQuestion, EditorSection } from './editorTypes';
import type { ValidationView } from './validationView';
import { SectionCard } from './SectionCard';
import {
  createBlankQuestion,
  createBlankSection,
  createBlankOption,
  duplicateQuestion,
  duplicateSection,
  editorStateToQuestionSet,
  questionSetToEditorState,
} from './editorTransforms';

interface QuestionSetEditorProps {
  value: EditorState;
  onChange: (next: EditorState) => void;
  validationView: ValidationView;
}

function move<T>(arr: T[], from: number, dir: -1 | 1): T[] {
  const to = from + dir;
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function replaceAt<T>(arr: T[], index: number, next: T): T[] {
  const copy = arr.slice();
  copy[index] = next;
  return copy;
}

export function QuestionSetEditor({ value, onChange, validationView }: QuestionSetEditorProps) {
  const [mode, setMode] = useState<EditorMode>('structured');
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  // When true, jsonText is in sync with value and edits should be pushed up.
  const [jsonHydrated, setJsonHydrated] = useState(false);

  const structuredErrors = useMemo(() => {
    const view = validationView;
    const count =
      view.top.version.length +
      view.top.assessmentType.length +
      view.top.sections.length +
      view.top.questions.length +
      view.top.general.length +
      view.unattached.length +
      view.sections.reduce(
        (acc, s) =>
          acc +
          s.id.length +
          s.title.length +
          s.questionIds.length +
          s.questions.reduce(
            (qa, q) =>
              qa +
              q.id.length +
              q.text.length +
              q.options.length +
              q.missingValues.length +
              q.optionsList.reduce(
                (oa, o) => oa + o.id.length + o.label.length + o.value.length,
                0,
              ),
            0,
          ),
        0,
      );
    return count;
  }, [validationView]);

  const switchToJson = () => {
    setJsonText(JSON.stringify(editorStateToQuestionSet(value), null, 2));
    setJsonError(null);
    setJsonHydrated(true);
    setMode('json');
  };

  const switchToStructured = () => {
    // Commit any pending JSON edits before switching.
    if (jsonError) {
      // refuse to switch until the JSON parses
      return;
    }
    setMode('structured');
    setJsonHydrated(false);
  };

  const handleJsonChange = (next: string) => {
    setJsonText(next);
    let parsed: unknown;
    try {
      parsed = JSON.parse(next);
    } catch (err) {
      setJsonError(err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON');
      return;
    }
    let editorState: EditorState;
    try {
      editorState = questionSetToEditorState(parsed as any);
    } catch (err) {
      setJsonError(
        err instanceof Error ? `Could not read as question set: ${err.message}` : 'Could not read as question set',
      );
      return;
    }
    setJsonError(null);
    onChange(editorState);
  };

  // ---- section handlers ----
  const updateSection = (si: number, patch: Partial<EditorSection>) => {
    const sections = replaceAt(value.sections, si, { ...value.sections[si], ...patch });
    onChange({ ...value, sections });
  };
  const addSection = () => {
    onChange({ ...value, sections: [...value.sections, createBlankSection()] });
  };
  const removeSection = (si: number) => {
    if (value.sections.length <= 1) return;
    onChange({ ...value, sections: value.sections.filter((_, i) => i !== si) });
  };
  const moveSection = (si: number, dir: -1 | 1) => {
    onChange({ ...value, sections: move(value.sections, si, dir) });
  };
  const duplicateSectionAt = (si: number) => {
    const copy = duplicateSection(value.sections[si]);
    const sections = value.sections.slice();
    sections.splice(si + 1, 0, copy);
    onChange({ ...value, sections });
  };

  // ---- question handlers ----
  const addQuestion = (si: number) => {
    const sections = value.sections.map((s, i) =>
      i === si ? { ...s, questions: [...s.questions, createBlankQuestion()] } : s,
    );
    onChange({ ...value, sections });
  };
  const updateQuestion = (si: number, qi: number, patch: Partial<EditorQuestion>) => {
    const section = value.sections[si];
    const questions = replaceAt(section.questions, qi, { ...section.questions[qi], ...patch });
    const sections = replaceAt(value.sections, si, { ...section, questions });
    onChange({ ...value, sections });
  };
  const removeQuestion = (si: number, qi: number) => {
    const section = value.sections[si];
    const questions = section.questions.filter((_, i) => i !== qi);
    const sections = replaceAt(value.sections, si, { ...section, questions });
    onChange({ ...value, sections });
  };
  const moveQuestion = (si: number, qi: number, dir: -1 | 1) => {
    const section = value.sections[si];
    const questions = move(section.questions, qi, dir);
    const sections = replaceAt(value.sections, si, { ...section, questions });
    onChange({ ...value, sections });
  };
  const duplicateQuestionAt = (si: number, qi: number) => {
    const section = value.sections[si];
    const copy = duplicateQuestion(section.questions[qi]);
    const questions = section.questions.slice();
    questions.splice(qi + 1, 0, copy);
    const sections = replaceAt(value.sections, si, { ...section, questions });
    onChange({ ...value, sections });
  };

  // ---- option handlers ----
  const addOption = (si: number, qi: number) => {
    const section = value.sections[si];
    const question = section.questions[qi];
    const options = [...question.options, createBlankOption(question.options.length)];
    updateQuestion(si, qi, { options });
  };
  const updateOption = (
    si: number,
    qi: number,
    oi: number,
    patch: Partial<EditorQuestion['options'][number]>,
  ) => {
    const section = value.sections[si];
    const question = section.questions[qi];
    const options = replaceAt(question.options, oi, { ...question.options[oi], ...patch });
    const questions = replaceAt(section.questions, qi, { ...question, options });
    const sections = replaceAt(value.sections, si, { ...section, questions });
    onChange({ ...value, sections });
  };
  const removeOption = (si: number, qi: number, oi: number) => {
    const section = value.sections[si];
    const question = section.questions[qi];
    const options = question.options.filter((_, i) => i !== oi);
    const questions = replaceAt(section.questions, qi, { ...question, options });
    const sections = replaceAt(value.sections, si, { ...section, questions });
    onChange({ ...value, sections });
  };
  const moveOption = (si: number, qi: number, oi: number, dir: -1 | 1) => {
    const section = value.sections[si];
    const question = section.questions[qi];
    const options = move(question.options, oi, dir);
    const questions = replaceAt(section.questions, qi, { ...question, options });
    const sections = replaceAt(value.sections, si, { ...section, questions });
    onChange({ ...value, sections });
  };

  const totalQuestions = value.sections.reduce((n, s) => n + s.questions.length, 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Question Set</h2>
          <span className="text-xs text-gray-500">
            {value.sections.length} section{value.sections.length === 1 ? '' : 's'} · {totalQuestions} question
            {totalQuestions === 1 ? '' : 's'}
          </span>
        </div>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => switchToStructured()}
            className={`px-3 py-1.5 ${
              mode === 'structured' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Structured
          </button>
          <button
            type="button"
            onClick={switchToJson}
            className={`px-3 py-1.5 border-l border-gray-200 ${
              mode === 'json' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            JSON (advanced)
          </button>
        </div>
      </div>

      {structuredErrors > 0 && mode === 'structured' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-5">
          <p className="text-sm font-semibold text-red-800 mb-1">
            {structuredErrors} validation issue{structuredErrors === 1 ? '' : 's'} to fix before saving
          </p>
          <ValidationSummary view={validationView} />
        </div>
      )}

      {mode === 'structured' ? (
        <div className="space-y-5">
          {value.sections.map((section, si) => (
            <SectionCard
              key={section.id}
              section={section}
              index={si}
              total={value.sections.length}
              error={validationView.sections[si] ?? emptySectionValidation()}
              onChange={(patch) => updateSection(si, patch)}
              onRemove={() => removeSection(si)}
              onMoveUp={() => moveSection(si, -1)}
              onMoveDown={() => moveSection(si, 1)}
              onDuplicate={() => duplicateSectionAt(si)}
              onAddQuestion={() => addQuestion(si)}
              onQuestionChange={(qi, patch) => updateQuestion(si, qi, patch)}
              onQuestionRemove={(qi) => removeQuestion(si, qi)}
              onQuestionMoveUp={(qi) => moveQuestion(si, qi, -1)}
              onQuestionMoveDown={(qi) => moveQuestion(si, qi, 1)}
              onQuestionDuplicate={(qi) => duplicateQuestionAt(si, qi)}
              onAddOption={(qi) => addOption(si, qi)}
              onOptionChange={(qi, oi, patch) => updateOption(si, qi, oi, patch)}
              onOptionRemove={(qi, oi) => removeOption(si, qi, oi)}
              onOptionMoveUp={(qi, oi) => moveOption(si, qi, oi, -1)}
              onOptionMoveDown={(qi, oi) => moveOption(si, qi, oi, 1)}
            />
          ))}
          <button
            type="button"
            onClick={addSection}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 font-medium"
          >
            + Add section
          </button>
        </div>
      ) : (
        <div>
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            spellCheck={false}
            className="w-full h-[520px] font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {jsonError ? (
            <p className="mt-2 text-sm text-red-700">{jsonError}</p>
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              Editing raw JSON. Switching back to Structured requires valid JSON that parses into a question set.
            </p>
          )}
          {jsonError && (
            <button
              type="button"
              onClick={switchToJson}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
              // re-hydrate from current structured state to discard broken JSON
              title="Discard broken JSON and reload from the structured editor"
            >
              Discard JSON changes
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ValidationSummary({ view }: { view: ValidationView }) {
  const all: string[] = [
    ...view.top.version,
    ...view.top.assessmentType,
    ...view.top.sections,
    ...view.top.questions,
    ...view.top.general,
    ...view.unattached,
  ];
  for (const s of view.sections) {
    all.push(...s.id, ...s.title, ...s.questionIds);
    for (const q of s.questions) {
      all.push(...q.id, ...q.text, ...q.options);
      for (const o of q.optionsList) all.push(...o.id, ...o.label, ...o.value);
    }
  }
  if (all.length === 0) return null;
  return (
    <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
      {all.slice(0, 50).map((e, i) => (
        <li key={i}>{e}</li>
      ))}
      {all.length > 50 && <li>…and {all.length - 50} more</li>}
    </ul>
  );
}

function emptySectionValidation() {
  return { id: [], title: [], questionIds: [], questions: [] };
}
