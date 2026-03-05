'use client';

import { useState } from 'react';
import type { JournalEntryType } from '@/lib/journal';

export const TAB_TO_ENTRY_TYPE: Record<string, JournalEntryType> = {
  food: 'intake',
  water: 'water',
  sleep: 'sleep',
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
  sleep: 'Sleep',
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

export const ALL_TAB_IDS = [
  'food',
  'water',
  'sleep',
  'supplements',
  'mood',
  'bowel',
  'cycle',
  'movement',
  'blood_pressure',
] as const;

export type LogTabId = (typeof ALL_TAB_IDS)[number];

const inputClass = 'w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30';
const selectClass = 'w-full px-4 pr-10 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30 appearance-none';
const labelClass = 'block text-brand-50/80 text-sm font-medium mb-1.5';
const btnClass = 'w-full py-3 rounded-full bg-brand-200 text-brand-900 font-semibold hover:bg-brand-100 transition-colors disabled:opacity-50';

interface BaseFormProps {
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
  initialValues?: Record<string, unknown>;
  submitLabel?: string;
}

/* ── Water ─────────────────────────────────────────────────────── */

const WATER_PRESETS = [
  { oz: 4, label: '4 oz', sub: '½ cup' },
  { oz: 8, label: '8 oz', sub: '1 cup' },
  { oz: 12, label: '12 oz', sub: 'can' },
  { oz: 16, label: '16 oz', sub: 'pint' },
  { oz: 20, label: '20 oz', sub: 'bottle' },
  { oz: 34, label: '34 oz', sub: '1 liter' },
];

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

  const handlePreset = async (oz: number) => {
    const val = unit === 'ml' ? Math.round(oz * 29.574) : oz;
    await onSubmit({ amount: val, unit });
  };

  return (
    <div className="space-y-5">
      {/* Quick presets */}
      <div>
        <label className={labelClass}>Quick Add</label>
        <div className="grid grid-cols-3 gap-2">
          {WATER_PRESETS.map((p) => (
            <button
              key={p.oz}
              type="button"
              onClick={() => handlePreset(p.oz)}
              disabled={isSubmitting}
              className="flex flex-col items-center py-3 rounded-xl bg-brand-700 hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              <span className="text-brand-50 font-semibold text-base">{p.label}</span>
              <span className="text-brand-50/50 text-xs">{p.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Manual entry */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>Custom Amount</label>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              step="1"
              className={inputClass}
              required
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'oz' | 'ml')}
              className={`${selectClass} w-24`}
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
    </div>
  );
}

/* ── Sleep ─────────────────────────────────────────────────────── */

const SLEEP_QUALITY_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

export function SleepForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const raw = initialValues?.durationMinutes ?? 480; // 8h default
  const [hours, setHours] = useState(String(Math.floor((raw as number) / 60)));
  const [minutes, setMinutes] = useState(String((raw as number) % 60));
  const [quality, setQuality] = useState(String(initialValues?.quality ?? ''));
  const [note, setNote] = useState(String(initialValues?.note ?? ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const totalMin = h * 60 + m;
    if (totalMin < 1 || totalMin > 1440) return;
    const payload: Record<string, unknown> = { durationMinutes: totalMin };
    const q = parseInt(quality, 10);
    if (!isNaN(q) && q >= 1 && q <= 5) payload.quality = q as 1 | 2 | 3 | 4 | 5;
    if (note.trim()) payload.note = note.trim();
    await onSubmit(payload);
    if (!initialValues) { setHours('8'); setMinutes('0'); setQuality(''); setNote(''); }
  };

  const qualityNum = quality ? parseInt(quality, 10) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Hours</label>
          <input
            type="number"
            inputMode="numeric"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            min="0"
            max="24"
            step="1"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Minutes</label>
          <input
            type="number"
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            min="0"
            max="59"
            step="1"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Quality (optional)</label>
        <input
          type="range"
          min="1"
          max="5"
          value={quality || '3'}
          onChange={(e) => setQuality(e.target.value)}
          className="w-full h-3 rounded-full accent-brand-200"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-brand-50 font-semibold text-2xl">{quality || '—'}</span>
          <span className="text-brand-50/60 text-sm">{qualityNum ? SLEEP_QUALITY_LABELS[qualityNum] : 'Not rated'}</span>
        </div>
      </div>
      <div>
        <label className={labelClass}>Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g., Woke up once, felt rested"
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>
      <button type="submit" disabled={isSubmitting} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Log Sleep')}
      </button>
    </form>
  );
}

/* ── Supplements ───────────────────────────────────────────────── */

const SUPPLEMENT_FORMS = ['Capsule', 'Tablet', 'Powder', 'Liquid', 'Gummy', 'Softgel'] as const;
const DOSE_UNITS = ['mg', 'mcg', 'IU', 'g', 'mL', 'drops'] as const;

export function SupplementForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [name, setName] = useState(String(initialValues?.name ?? ''));
  const [form, setForm] = useState(String(initialValues?.form ?? ''));
  const [dose, setDose] = useState(String(initialValues?.dose ?? ''));
  const [doseUnit, setDoseUnit] = useState(String(initialValues?.doseUnit ?? initialValues?.unit ?? 'mg'));
  const [qty, setQty] = useState(String(initialValues?.qty ?? '1'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name: name.trim() };
    if (form) payload.form = form;
    const d = parseFloat(dose);
    if (!isNaN(d) && d > 0) {
      payload.dose = d;
      payload.unit = doseUnit;
    }
    const q = parseInt(qty, 10);
    if (!isNaN(q) && q > 0) payload.qty = q;
    await onSubmit(payload);
    if (!initialValues) { setName(''); setDose(''); setQty('1'); }
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
      <div>
        <label className={labelClass}>Form</label>
        <select value={form} onChange={(e) => setForm(e.target.value)} className={selectClass}>
          <option value="">Select…</option>
          {SUPPLEMENT_FORMS.map((f) => <option key={f} value={f.toLowerCase()}>{f}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Dose</label>
          <input
            type="number"
            inputMode="decimal"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="e.g., 5000"
            min="0"
            step="any"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Unit</label>
          <select value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} className={selectClass}>
            {DOSE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Qty</label>
          <input
            type="number"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            min="1"
            step="1"
            placeholder="1"
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

/* ── Mood ──────────────────────────────────────────────────────── */

const MOOD_LABELS: Record<number, string> = {
  1: 'Very Low',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

export function MoodForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const raw = initialValues?.score != null ? Number(initialValues.score) : 3;
  const clamped = Math.max(1, Math.min(5, raw > 5 ? Math.round(raw / 2) : raw));
  const [score, setScore] = useState(String(clamped));
  const [note, setNote] = useState(String(initialValues?.note ?? ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseInt(score, 10);
    if (isNaN(s) || s < 1 || s > 5) return;
    await onSubmit({ score: s, note: note.trim() || undefined });
    if (!initialValues) { setScore('3'); setNote(''); }
  };

  const scoreNum = parseInt(score, 10) || 3;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Mood (1–5)</label>
        <input
          type="range"
          min="1"
          max="5"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-full h-3 rounded-full accent-brand-200"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-brand-50 font-semibold text-2xl">{score}</span>
          <span className="text-brand-50/60 text-sm">{MOOD_LABELS[scoreNum] ?? ''}</span>
        </div>
      </div>
      <div>
        <label className={labelClass}>Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How are you feeling?"
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </div>
      <button type="submit" disabled={isSubmitting} className={btnClass}>
        {isSubmitting ? 'Saving…' : (submitLabel ?? 'Log Mood')}
      </button>
    </form>
  );
}

/* ── Bowel ─────────────────────────────────────────────────────── */

const BRISTOL_TYPES: { type: number; label: string; desc: string; icon: string }[] = [
  { type: 1, label: '1', desc: 'Hard lumps', icon: '●●●' },
  { type: 2, label: '2', desc: 'Lumpy sausage', icon: '⬬⬬' },
  { type: 3, label: '3', desc: 'Cracked sausage', icon: '▬▬' },
  { type: 4, label: '4', desc: 'Smooth, soft', icon: '━━' },
  { type: 5, label: '5', desc: 'Soft blobs', icon: '◕◕' },
  { type: 6, label: '6', desc: 'Mushy', icon: '≋≋' },
  { type: 7, label: '7', desc: 'Liquid', icon: '〰️' },
];

export function BowelForm({ onSubmit, isSubmitting, initialValues, submitLabel }: BaseFormProps) {
  const [bristol, setBristol] = useState(Number(initialValues?.bristol ?? 4));
  const [urgency, setUrgency] = useState(String(initialValues?.urgency ?? ''));
  const [discomfort, setDiscomfort] = useState(String(initialValues?.discomfort ?? ''));
  const [note, setNote] = useState(String(initialValues?.note ?? ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { bristol };
    const u = parseInt(urgency, 10);
    if (!isNaN(u) && u >= 0 && u <= 3) payload.urgency = u;
    const d = parseInt(discomfort, 10);
    if (!isNaN(d) && d >= 0 && d <= 3) payload.discomfort = d;
    if (note.trim()) payload.note = note.trim();
    await onSubmit(payload);
    if (!initialValues) { setBristol(4); setUrgency(''); setDiscomfort(''); setNote(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Bristol Scale</label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {BRISTOL_TYPES.map((b) => (
            <button
              key={b.type}
              type="button"
              onClick={() => setBristol(b.type)}
              className={`flex flex-col items-center shrink-0 w-[4.25rem] py-2.5 px-1 rounded-xl border transition-all ${
                bristol === b.type
                  ? 'border-brand-200 bg-brand-200/15 ring-1 ring-brand-200/40'
                  : 'border-white/10 bg-brand-700 hover:border-white/20'
              }`}
            >
              <span className="text-lg leading-none mb-0.5">{b.icon}</span>
              <span className={`text-xs font-semibold ${bristol === b.type ? 'text-brand-200' : 'text-brand-50/80'}`}>{b.label}</span>
              <span className="text-[10px] text-brand-50/50 leading-tight text-center mt-0.5">{b.desc}</span>
            </button>
          ))}
        </div>
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

/* ── Cycle ─────────────────────────────────────────────────────── */

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
        <select value={phase} onChange={(e) => setPhase(e.target.value)} className={selectClass}>
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

/* ── Movement ──────────────────────────────────────────────────── */

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
        <select value={intensity} onChange={(e) => setIntensity(e.target.value as '1' | '2' | '3')} className={selectClass}>
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

/* ── Blood Pressure ────────────────────────────────────────────── */

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
