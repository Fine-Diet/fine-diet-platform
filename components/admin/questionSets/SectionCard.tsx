/**
 * One section card: id, title, reorder up/down, duplicate, delete, and the
 * list of question cards that belong to it. Add-question appends a blank
 * question (with four default options 0..3) inside this section.
 */

import type { EditorSection, EditorQuestion } from './editorTypes';
import type { SectionValidation } from './validationView';
import { QuestionCard } from './QuestionCard';

interface SectionCardProps {
  section: EditorSection;
  index: number;
  total: number;
  error: SectionValidation;
  onChange: (patch: Partial<EditorSection>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onAddQuestion: () => void;
  onQuestionChange: (questionIndex: number, patch: Partial<EditorQuestion>) => void;
  onQuestionRemove: (questionIndex: number) => void;
  onQuestionMoveUp: (questionIndex: number) => void;
  onQuestionMoveDown: (questionIndex: number) => void;
  onQuestionDuplicate: (questionIndex: number) => void;
  onAddOption: (questionIndex: number) => void;
  onOptionChange: (
    questionIndex: number,
    optionIndex: number,
    patch: Partial<EditorQuestion['options'][number]>,
  ) => void;
  onOptionRemove: (questionIndex: number, optionIndex: number) => void;
  onOptionMoveUp: (questionIndex: number, optionIndex: number) => void;
  onOptionMoveDown: (questionIndex: number, optionIndex: number) => void;
}

function errorClasses(hasError: boolean): string {
  return hasError
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
}

export function SectionCard(props: SectionCardProps) {
  const {
    section,
    index,
    total,
    error,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onAddQuestion,
    onQuestionChange,
    onQuestionRemove,
    onQuestionMoveUp,
    onQuestionMoveDown,
    onQuestionDuplicate,
    onAddOption,
    onOptionChange,
    onOptionRemove,
    onOptionMoveUp,
    onOptionMoveDown,
  } = props;

  const idErr = error.id[0];
  const titleErr = error.title[0];
  const questionIdsErr = error.questionIds[0];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move section up"
            className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-xs"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move section down"
            className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-xs"
          >
            ↓
          </button>
          <span className="text-sm font-semibold text-gray-800">Section {index + 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={total <= 1}
            className="px-2.5 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3 mb-4">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Section id</span>
          <input
            value={section.id}
            onChange={(e) => onChange({ id: e.target.value })}
            className={`mt-1 block w-full rounded-md shadow-sm font-mono text-xs ${errorClasses(Boolean(idErr))}`}
          />
          {idErr && <span className="block text-xs text-red-700 mt-1">{idErr}</span>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Section title</span>
          <input
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Section title shown to the user"
            className={`mt-1 block w-full rounded-md shadow-sm text-sm ${errorClasses(Boolean(titleErr))}`}
          />
          {titleErr && <span className="block text-xs text-red-700 mt-1">{titleErr}</span>}
        </label>
      </div>

      {questionIdsErr && (
        <p className="text-xs text-red-700 mb-3">{questionIdsErr}</p>
      )}

      <div className="space-y-3">
        {section.questions.map((question, qi) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={qi}
            total={section.questions.length}
            error={error.questions[qi] ?? emptyQuestionValidation()}
            onChange={(patch) => onQuestionChange(qi, patch)}
            onRemove={() => onQuestionRemove(qi)}
            onMoveUp={() => onQuestionMoveUp(qi)}
            onMoveDown={() => onQuestionMoveDown(qi)}
            onDuplicate={() => onQuestionDuplicate(qi)}
            onAddOption={() => onAddOption(qi)}
            onOptionChange={(oi, patch) => onOptionChange(qi, oi, patch)}
            onOptionRemove={(oi) => onOptionRemove(qi, oi)}
            onOptionMoveUp={(oi) => onOptionMoveUp(qi, oi)}
            onOptionMoveDown={(oi) => onOptionMoveDown(qi, oi)}
          />
        ))}
        {section.questions.length === 0 && (
          <p className="text-sm text-gray-500">No questions in this section yet.</p>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onAddQuestion}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 font-medium"
        >
          + Add question
        </button>
      </div>
    </div>
  );
}

function emptyQuestionValidation() {
  return { id: [], text: [], options: [], missingValues: [], optionsList: [] };
}
