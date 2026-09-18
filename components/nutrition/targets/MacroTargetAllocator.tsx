'use client';

import {
  caloriesForGrams,
  type MacroGramsKey,
  type MacroLockKey,
  type MacroLocks,
} from '@/lib/nutrition/targets/macroEnergy';

const COLUMNS: {
  key: MacroGramsKey;
  lock: MacroLockKey;
  label: string;
}[] = [
  { key: 'protein_g', lock: 'protein', label: 'Protein' },
  { key: 'carbs_g', lock: 'carbs', label: 'Carbs' },
  { key: 'fat_g', lock: 'fat', label: 'Fat' },
];

function formatKcal(value: number): string {
  return Math.round(value).toLocaleString();
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function MacroTargetAllocator({
  calorie,
  onCalorieChange,
  protein,
  carbs,
  fat,
  onGramsChange,
  onGramsBlur,
  onPercentChange,
  locks,
  onToggleLock,
  error,
  balanceDisabled,
  resetDisabled,
  saveDisabled,
  saving,
  onBalance,
  onReset,
  onSave,
  liveGrams,
}: {
  calorie: number | null;
  onCalorieChange: (value: number | null) => void;
  protein: string;
  carbs: string;
  fat: string;
  onGramsChange: (key: MacroGramsKey, value: string) => void;
  onGramsBlur: (key: MacroGramsKey, value: string) => void;
  onPercentChange: (key: MacroGramsKey, value: string) => void;
  locks: MacroLocks;
  onToggleLock: (key: MacroLockKey) => void;
  error?: string;
  balanceDisabled: boolean;
  resetDisabled: boolean;
  saveDisabled: boolean;
  saving: boolean;
  onBalance: () => void;
  onReset: () => void;
  onSave: () => void;
  liveGrams: Record<MacroGramsKey, number | null>;
}) {
  const gramValue: Record<MacroGramsKey, string> = {
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-brand-50/55 text-xs font-medium mb-1.5">Daily caloric goal</label>
        <input
          type="number"
          inputMode="numeric"
          className="w-full rounded-full border border-white/10 bg-neutral-900 px-5 py-3 text-xl text-brand-50 placeholder-brand-50/35 shadow-inner focus:outline-none focus:ring-2 focus:ring-brand-200/20"
          placeholder="Enter a target"
          value={calorie ?? ''}
          onChange={(event) =>
            onCalorieChange(event.target.value === '' ? null : Number(event.target.value))
          }
          min={0}
          step={50}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
        {COLUMNS.map((column) => {
          const grams = liveGrams[column.key];
          const kcal = grams == null ? null : caloriesForGrams(column.key, grams);
          const percent =
            calorie && calorie > 0 && grams != null
              ? Math.round((caloriesForGrams(column.key, grams) / calorie) * 100)
              : '';
          const locked = locks[column.lock];
          return (
            <div key={column.key}>
              <p className="mb-1.5 text-[11px] text-white/45 antialiased">
                {column.label} - {kcal == null ? '—' : `${formatKcal(kcal)} kcal`}
              </p>
              <div className="flex min-h-[44px] items-stretch overflow-hidden rounded-full border border-white/15">
                <label className="flex min-w-0 flex-[1.2] items-center gap-1 px-3">
                  <span className="sr-only">{column.label} grams</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-full min-w-0 bg-transparent text-xl text-brand-50 focus:outline-none"
                    value={gramValue[column.key]}
                    onChange={(event) => onGramsChange(column.key, event.target.value)}
                    onBlur={(event) => onGramsBlur(column.key, event.target.value)}
                  />
                  <span className="text-[11px] text-white/40">g</span>
                </label>
                <label className="flex min-w-0 flex-1 items-center gap-1 border-l border-white/10 px-2">
                  <span className="sr-only">{column.label} percent</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-full min-w-0 bg-transparent text-xl text-brand-50 focus:outline-none"
                    key={`${column.key}-${gramValue[column.key]}-${calorie ?? ''}`}
                    defaultValue={percent === '' ? '' : String(percent)}
                    onBlur={(event) => onPercentChange(column.key, event.target.value)}
                  />
                  <span className="text-[11px] text-white/40">%</span>
                </label>
                <button
                  type="button"
                  aria-pressed={locked}
                  aria-label={locked ? `Unlock ${column.label}` : `Lock ${column.label}`}
                  onClick={() => onToggleLock(column.lock)}
                  className={`flex w-11 flex-shrink-0 items-center justify-center border-l border-white/10 ${
                    locked ? 'bg-brand-50 text-black' : 'text-white/35 hover:text-white/70'
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${locked ? 'bg-brand-50' : 'bg-white/5'}`}>
                    <LockIcon className="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p className="text-xs text-red-400 antialiased">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="flex gap-2 sm:contents">
          <button
            type="button"
            onClick={onBalance}
            disabled={balanceDisabled}
            className="flex-1 rounded-full border border-white/10 py-3 text-center text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white/90 disabled:opacity-40"
          >
            Balance
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={resetDisabled}
            className="flex-1 rounded-full border border-white/10 py-3 text-center text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white/90 disabled:opacity-40"
          >
            Reset
          </button>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled || saving}
          className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-50 sm:w-auto sm:flex-[2]"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
