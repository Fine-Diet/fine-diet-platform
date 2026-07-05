/**
 * One question card: id, text, and its list of answer options. Supports
 * add/remove/reorder/duplicate for the question and add/remove/reorder for
 * its options. Per-field validation errors are surfaced inline.
 */

import type { EditorQuestion } from './editorTypes';
import type { QuestionValidation } from './validationView';
import { OptionRow } from './OptionRow';

interface QuestionCardProps {
  question: EditorQuestion;
  index: number;
  total: number;
  error: QuestionValidation;
  onChange: (patch: Partial<EditorQuestion>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onAddOption: () => void;
  onOptionChange: (optionIndex: number, patch: Partial<EditorQuestion['options'][number]>) => void;
  onOptionRemove: (optionIndex: number) => void;
  onOptionMoveUp: (optionIndex: number) => void;
  onOptionMoveDown: (optionIndex: number) => void;
}

function errorClasses(hasError: boolean): string {
  return hasError
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
}

export function QuestionCard({
  question,
  index,
  total,
  error,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onAddOption,
  onOptionChange,
  onOptionRemove,
  onOptionMoveUp,
  onOptionMoveDown,
}: QuestionCardProps) {
  const idErr = error.id[0];
  const textErr = error.text[0];
  const optionsErr = error.options[0];

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50/60 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move question up"
            className="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-xs"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move question down"
            className="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-xs"
          >
            ↓
          </button>
          <span className="text-sm font-medium text-gray-700">Question {index + 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className="px-2.5 py-1 text-xs rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="px-2.5 py-1 text-xs rounded border border-red-200 bg-white text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 mb-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Question id</span>
          <input
            value={question.id}
            onChange={(e) => onChange({ id: e.target.value })}
            className={`mt-1 block w-full rounded-md shadow-sm font-mono text-xs ${errorClasses(Boolean(idErr))}`}
          />
          {idErr && <span className="block text-xs text-red-700 mt-1">{idErr}</span>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Question text</span>
          <textarea
            value={question.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            placeholder="What the user is asked"
            className={`mt-1 block w-full rounded-md shadow-sm text-sm ${errorClasses(Boolean(textErr))}`}
          />
          {textErr && <span className="block text-xs text-red-700 mt-1">{textErr}</span>}
        </label>
      </div>

      <div className="bg-white rounded-md border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Answer options
          </span>
          <button
            type="button"
            onClick={onAddOption}
            className="px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            + Add option
          </button>
        </div>
        <div className="grid grid-cols-[auto_1fr_7rem_auto] gap-x-2 text-[11px] font-medium text-gray-400 uppercase tracking-wide px-1 pb-1 hidden sm:grid">
          <span>Order</span>
          <span>Label</span>
          <span>Value</span>
          <span />
        </div>
        <div className="divide-y divide-gray-100">
          {question.options.map((option, oi) => (
            <OptionRow
              key={option.id}
              option={option}
              index={oi}
              total={question.options.length}
              error={error.optionsList[oi] ?? { id: [], label: [], value: [] }}
              onChange={(patch) => onOptionChange(oi, patch)}
              onRemove={() => onOptionRemove(oi)}
              onMoveUp={() => onOptionMoveUp(oi)}
              onMoveDown={() => onOptionMoveDown(oi)}
            />
          ))}
          {question.options.length === 0 && (
            <p className="text-xs text-gray-500 py-2">No options yet. Add at least four with values 0,1,2,3.</p>
          )}
        </div>
        {optionsErr && <p className="text-xs text-red-700 mt-2">{optionsErr}</p>}
        {error.missingValues.length > 0 && (
          <p className="text-xs text-red-700 mt-2">
            Missing value {error.missingValues.map((v) => v).join(', ')} — each question needs options with values 0, 1, 2, and 3 exactly once.
          </p>
        )}
      </div>
    </div>
  );
}
