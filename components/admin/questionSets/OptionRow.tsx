/**
 * One answer-option row inside a question card: id, label, scoring value
 * (0..3), reorder up/down, and remove. Validation errors for this option are
 * surfaced inline via the `error` prop.
 */

import type { EditorOption } from './editorTypes';
import type { OptionValidation } from './validationView';

interface OptionRowProps {
  option: EditorOption;
  index: number;
  total: number;
  error: OptionValidation;
  onChange: (patch: Partial<EditorOption>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const VALUE_CHOICES = [0, 1, 2, 3];

function errorClasses(hasError: boolean): string {
  return hasError
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
}

export function OptionRow({
  option,
  index,
  total,
  error,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: OptionRowProps) {
  const idErr = error.id[0];
  const labelErr = error.label[0];
  const valueErr = error.value[0];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3 py-2">
      <div className="flex items-center gap-1 self-start mt-1.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label="Move option up"
          className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white text-xs"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          aria-label="Move option down"
          className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white text-xs"
        >
          ↓
        </button>
        <span className="text-xs text-gray-400 w-5 text-right" title="Option position">
          {index + 1}
        </span>
      </div>

      <label className="block flex-1">
        <span className="sr-only">Option label</span>
        <input
          value={option.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Option label (shown to the user)"
          className={`block w-full rounded-md shadow-sm text-sm ${errorClasses(Boolean(labelErr))}`}
        />
        {labelErr && <span className="block text-xs text-red-700 mt-1">{labelErr}</span>}
      </label>

      <label className="block w-28">
        <span className="sr-only">Option value (scoring)</span>
        <select
          value={option.value}
          onChange={(e) => onChange({ value: Number(e.target.value) })}
          className={`block w-full rounded-md shadow-sm text-sm ${errorClasses(Boolean(valueErr))}`}
        >
          {VALUE_CHOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {valueErr && <span className="block text-xs text-red-700 mt-1">{valueErr}</span>}
      </label>

      <div className="flex flex-col self-start mt-1.5">
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove option"
          title="Remove option"
          className="w-7 h-7 rounded border border-gray-200 text-red-600 hover:bg-red-50 text-xs"
        >
          ✕
        </button>
      </div>

      {idErr && <p className="text-xs text-red-700 sm:w-full basis-full -mt-1">{idErr}</p>}
    </div>
  );
}
