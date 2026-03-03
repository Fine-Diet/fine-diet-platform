'use client';

import { useState } from 'react';
import type { JournalEntryType } from '@/lib/journal';

/** Tab id (UI) maps to API entry_type */
export const TAB_TO_ENTRY_TYPE: Record<string, JournalEntryType> = {
  food: 'intake',
  water: 'water',
  supplements: 'supplement',
  mood: 'mood',
  bowel: 'bowel',
  cycle: 'cycle',
  movement: 'movement',
  blood_pressure: 'blood_pressure',
};

export const ENTRY_TYPE_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_ENTRY_TYPE).map(([k, v]) => [v, k])
);

const TAB_LABELS: Record<string, string> = {
  food: 'Food / Drinks',
  water: 'Water',
  supplements: 'Supplements',
  mood: 'Mood',
  bowel: 'Bowel',
  cycle: 'Cycle',
  movement: 'Movement',
  blood_pressure: 'Blood Pressure',
};

export function getTabLabel(tabId: string): string {
  return TAB_LABELS[tabId] ?? tabId;
}

/** All possible tabs in display order. Add-ons (blood_pressure, etc.) can be disabled by default. */
export const ALL_TAB_IDS = [
  'food',
  'water',
  'supplements',
  'mood',
  'bowel',
  'cycle',
  'movement',
  'blood_pressure',
] as const;

export type LogTabId = (typeof ALL_TAB_IDS)[number];

const inputClass = 'w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30';
const labelClass = 'block text-brand-50/80 text-sm font-medium mb-1.5';
const btnClass = 'w-full py-3 rounded-full bg-brand-200 text-brand-900 font-semibold hover:bg-brand-100 transition-colors disabled:opacity-50';

interface BaseFormProps {
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
  /** Pre-populate for edit mode */
  initialValues?: Record<string, unknown>;
  submitLabel?: string;
}

export function WaterForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [amount, setAmount] = useState(String(initialValues?.amount ?? '8'));
  const [unit, setUnit] = useState<'oz' | 'ml'>((initialValues?.unit as 'oz' | 'ml') ?? 'oz');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) return;
    await onSubmit({ amount: n, unit });
    if (!initialValues) setAmount('8');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Amount</label>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.1"
            step="0.5"
            className={inputClass}
            required
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'oz' | 'ml')}
            className={`${inputClass} w-20`}
          >
            <option value="oz">oz</option>
            <option value="ml">ml</option>
          </select>
        </div>
      </div>
      <button type="submit" disabled={isSubmitting} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Add Water')}
      </button>
    </form>
  );
}

export function SupplementForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [name, setName] = useState(String(initialValues?.name ?? ''));
  const [dose, setDose] = useState(String(initialValues?.dose ?? ''));
  const [unit, setUnit] = useState(String(initialValues?.unit ?? 'mg'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name: name.trim() };
    const d = parseFloat(dose);
    if (!isNaN(d) && d > 0) payload.dose = d;
    if (unit) payload.unit = unit;
    await onSubmit(payload);
    if (!initialValues) { setName(''); setDose(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Vitamin D"
          className={inputClass}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Dose</label>
          <input
            type="number"
            inputMode="decimal"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="Optional"
            min="0"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Unit</label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="mg, IU, etc."
            className={inputClass}
          />
        </div>
      </div>
      <button type="submit" disabled={isSubmitting || !name.trim()} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Add Supplement')}
      </button>
    </form>
  );
}

export function MoodForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [score, setScore] = useState(String(initialValues?.score ?? '5'));
  const [note, setNote] = useState(String(initialValues?.note ?? ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseInt(score, 10);
    if (isNaN(s) || s < 1 || s > 10) return;
    await onSubmit({ score: s, note: note.trim() || undefined });
    if (!initialValues) { setScore('5'); setNote(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Mood (1–10)</label>
        <input
          type="range"
          min="1"
          max="10"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-full h-3 rounded-full accent-brand-200"
        />
        <span className="text-brand-50 font-semibold text-xl">{score}</span>
      </div>
      <div>
        <label className={labelClass}>Note (optional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How are you feeling?"
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={isSubmitting} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Log Mood')}
      </button>
    </form>
  );
}

export function BowelForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [bristol, setBristol] = useState(String(initialValues?.bristol ?? '4'));
  const [urgency, setUrgency] = useState(String(initialValues?.urgency ?? ''));
  const [discomfort, setDiscomfort] = useState(String(initialValues?.discomfort ?? ''));
  const [note, setNote] = useState(String(initialValues?.note ?? ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { bristol: parseInt(bristol, 10) };
    const u = parseInt(urgency, 10);
    if (!isNaN(u) && u >= 0 && u <= 3) payload.urgency = u;
    const d = parseInt(discomfort, 10);
    if (!isNaN(d) && d >= 0 && d <= 3) payload.discomfort = d;
    if (note.trim()) payload.note = note.trim();
    await onSubmit(payload);
    if (!initialValues) { setBristol('4'); setUrgency(''); setDiscomfort(''); setNote(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Bristol scale (1–7)</label>
        <select value={bristol} onChange={(e) => setBristol(e.target.value)} className={inputClass} required>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? '(hard)' : n === 7 ? '(liquid)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Urgency (0–3)</label>
          <input
            type="number"
            min="0"
            max="3"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Discomfort (0–3)</label>
          <input
            type="number"
            min="0"
            max="3"
            value={discomfort}
            onChange={(e) => setDiscomfort(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      <button type="submit" disabled={isSubmitting} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Log Bowel')}
      </button>
    </form>
  );
}

export function CycleForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [phase, setPhase] = useState(String(initialValues?.phase ?? ''));
  const [cycleDay, setCycleDay] = useState(String(initialValues?.cycleDay ?? ''));
  const [symptoms, setSymptoms] = useState(Array.isArray(initialValues?.symptoms) ? (initialValues.symptoms as string[]).join(', ') : String(initialValues?.symptoms ?? ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    if (phase) payload.phase = phase as 'period' | 'follicular' | 'ovulation' | 'luteal';
    const d = parseInt(cycleDay, 10);
    if (!isNaN(d) && d >= 1 && d <= 35) payload.cycleDay = d;
    const tags = symptoms.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (tags.length) payload.symptoms = tags;
    if (Object.keys(payload).length === 0) return;
    await onSubmit(payload);
    if (!initialValues) { setPhase(''); setCycleDay(''); setSymptoms(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Phase</label>
        <select value={phase} onChange={(e) => setPhase(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          <option value="period">Period</option>
          <option value="follicular">Follicular</option>
          <option value="ovulation">Ovulation</option>
          <option value="luteal">Luteal</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Cycle day (1–35)</label>
        <input
          type="number"
          min="1"
          max="35"
          value={cycleDay}
          onChange={(e) => setCycleDay(e.target.value)}
          placeholder="Optional"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Symptoms (comma-separated)</label>
        <input
          type="text"
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          placeholder="e.g., cramps, fatigue"
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={isSubmitting || (!phase && !cycleDay && !symptoms.trim())} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Log Cycle')}
      </button>
    </form>
  );
}

export function MovementForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [type, setType] = useState(String(initialValues?.type ?? ''));
  const [minutes, setMinutes] = useState(String(initialValues?.minutes ?? '30'));
  const [intensity, setIntensity] = useState<'1' | '2' | '3'>(String(initialValues?.intensity ?? '2') as '1' | '2' | '3');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseInt(minutes, 10);
    if (!type.trim() || isNaN(m) || m <= 0) return;
    await onSubmit({
      type: type.trim(),
      minutes: m,
      intensity: parseInt(intensity, 10) as 1 | 2 | 3,
    });
    if (!initialValues) { setType(''); setMinutes('30'); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Activity type *</label>
        <input
          type="text"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="e.g., Walking, Yoga"
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass}>Minutes</label>
        <input
          type="number"
          min="1"
          max="1440"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass}>Intensity</label>
        <select value={intensity} onChange={(e) => setIntensity(e.target.value as '1' | '2' | '3')} className={inputClass}>
          <option value="1">Light</option>
          <option value="2">Moderate</option>
          <option value="3">Vigorous</option>
        </select>
      </div>
      <button type="submit" disabled={isSubmitting || !type.trim()} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Log Movement')}
      </button>
    </form>
  );
}

export function BloodPressureForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [systolic, setSystolic] = useState(String(initialValues?.systolic ?? ''));
  const [diastolic, setDiastolic] = useState(String(initialValues?.diastolic ?? ''));
  const [pulse, setPulse] = useState(String(initialValues?.pulse ?? ''));
  const [note, setNote] = useState(String(initialValues?.note ?? ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sys = parseInt(systolic, 10);
    const dia = parseInt(diastolic, 10);
    if (isNaN(sys) || isNaN(dia)) return;
    const payload: Record<string, unknown> = { systolic: sys, diastolic: dia, unit: 'mmHg' };
    const p = parseInt(pulse, 10);
    if (!isNaN(p) && p >= 30 && p <= 250) payload.pulse = p;
    if (note.trim()) payload.note = note.trim();
    await onSubmit(payload);
    if (!initialValues) { setSystolic(''); setDiastolic(''); setPulse(''); setNote(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Systolic (mmHg) *</label>
          <input
            type="number"
            min="50"
            max="300"
            value={systolic}
            onChange={(e) => setSystolic(e.target.value)}
            placeholder="120"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Diastolic (mmHg) *</label>
          <input
            type="number"
            min="30"
            max="200"
            value={diastolic}
            onChange={(e) => setDiastolic(e.target.value)}
            placeholder="80"
            className={inputClass}
            required
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Pulse (bpm, optional)</label>
        <input
          type="number"
          min="30"
          max="250"
          value={pulse}
          onChange={(e) => setPulse(e.target.value)}
          placeholder="Optional"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      <button type="submit" disabled={isSubmitting || !systolic || !diastolic} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Log Blood Pressure')}
      </button>
    </form>
  );
}
