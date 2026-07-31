'use client';

/**
 * Baseline start-date + capacity enrollment panel for Programs Home.
 * Uses the existing enroll API. Fixtures never persist enrollment.
 */

import { useEffect, useMemo, useState } from 'react';

import type { ProgramCapacity } from '@/lib/programs/runtimeTypes';

type StartDateChoice = 'today' | 'monday' | 'custom';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getComingMondayDate(): string {
  const date = new Date();
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return toDateInputValue(date);
}

export function BaselineStartFlowPanel({
  onStarted,
  onCancel,
  disabled = false,
}: {
  onStarted: () => Promise<void>;
  onCancel?: () => void;
  /** Fixture mode: show UI without calling enroll. */
  disabled?: boolean;
}) {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const monday = useMemo(() => getComingMondayDate(), []);
  const [startChoice, setStartChoice] = useState<StartDateChoice>('today');
  const [customDate, setCustomDate] = useState(today);
  const [capacity, setCapacity] = useState<ProgramCapacity>('steady');
  const [timezone, setTimezone] = useState('UTC');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      setTimezone('UTC');
    }
  }, []);

  const selectedStartDate =
    startChoice === 'today'
      ? today
      : startChoice === 'monday'
        ? monday
        : customDate;

  async function submitEnrollment() {
    if (disabled) {
      setError('Fixture preview only — enrollment is not persisted here.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch('/api/journal/programs/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_slug: 'baseline',
          selected_start_date: selectedStartDate,
          timezone,
          current_capacity: capacity,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not start Baseline.');
      }
      await onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Baseline.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/12 bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-white">Choose Start Date</p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-white/65 hover:text-white"
          >
            Close
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          { id: 'today' as const, label: 'Start now', value: today },
          { id: 'monday' as const, label: 'Coming Monday', value: monday },
          { id: 'custom' as const, label: 'Custom date', value: customDate },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setStartChoice(option.id)}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              startChoice === option.id
                ? 'border-brand-50 bg-brand-50 text-brand-900'
                : 'border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1]'
            }`}
          >
            <span className="block text-xs font-semibold">{option.label}</span>
            <span className="mt-0.5 block text-[11px] opacity-75">
              {option.id === 'custom' ? 'Pick below' : option.value}
            </span>
          </button>
        ))}
      </div>
      {startChoice === 'custom' ? (
        <label className="mt-3 block text-xs text-white/70">
          Custom start date
          <input
            type="date"
            value={customDate}
            min={today}
            onChange={(e) => setCustomDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
      ) : null}

      <p className="mt-4 text-xs font-semibold text-white/80">Current capacity</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(['low', 'steady', 'high'] as ProgramCapacity[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCapacity(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
              capacity === value
                ? 'bg-[#BCCCDC] text-[#1A1612]'
                : 'border border-white/20 text-white/80 hover:bg-white/10'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void submitEnrollment()}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#BCCCDC] text-sm font-semibold text-[#1A1612] transition hover:bg-[#c5d0da] disabled:opacity-70"
      >
        {saving ? 'Starting…' : disabled ? 'Preview only' : 'Start Baseline'}
      </button>
    </div>
  );
}
