'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { journalService, type UserGoals } from '@/lib/journal';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  cmToIn,
  inToCm,
  kgToLb,
  lbToKg,
  splitFeetInches,
  feetInchesToTotalInches,
  trimTrailingZero,
} from '@/lib/plans';
import {
  MEAL_SLOT_KEYS,
  MEAL_SLOT_DEFAULT_LABELS,
  type MealSchedule,
  type MealScheduleSlot,
  type MealSlotKey,
} from '@/lib/plans/types';
import {
  defaultMealSchedule,
  normalizeMealSchedule,
} from '@/lib/plans/scheduleResolver';

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const inputClass =
  'w-full rounded-full border border-white/10 bg-neutral-900 px-5 py-3 text-sm text-brand-50 placeholder-brand-50/35 shadow-inner focus:outline-none focus:ring-2 focus:ring-brand-200/20';
const selectClass =
  'w-full rounded-full border border-white/10 bg-neutral-900 px-5 py-3 pr-10 text-sm text-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-200/20 appearance-none';
const labelClass = 'block text-brand-50/55 text-xs font-medium mb-1.5';
const btnClass =
  'w-full py-3 rounded-full bg-brand-50 text-center text-sm text-black font-semibold hover:bg-brand-50 transition-colors disabled:opacity-50';

const GOAL_OPTIONS = [
  { value: 'weight_loss', label: 'Weight loss' },
  { value: 'weight_gain', label: 'Weight gain' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'gut_health', label: 'Gut health' },
  { value: 'energy', label: 'Energy' },
  { value: 'general_wellness', label: 'General wellness' },
];

const DIETARY_OPTIONS = [
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'other', label: 'Other' },
];

const EATING_WINDOW_OPTIONS = [
  { value: '16_8', label: '16 : 8' },
  { value: '14_10', label: '14 : 10' },
  { value: 'open', label: 'Open eating' },
  { value: 'custom', label: 'Custom' },
];

const SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'lightly_active', label: 'Lightly active' },
  { value: 'moderately_active', label: 'Moderately active' },
  { value: 'very_active', label: 'Very active' },
];

const SYMPTOM_OPTIONS = [
  'bloating',
  'fatigue',
  'skin',
  'digestion',
  'headaches',
  'joint_pain',
  'brain_fog',
] as const;

const TRACKING_KEY_LABELS: Record<string, string> = {
  intake: 'Intake',
  water: 'Hydration',
  sleep: 'Sleep',
  supplement: 'Supplements',
  mood: 'Mood',
  bowel: 'Bowel',
  cycle: 'Cycle',
  movement: 'Movement',
  blood_pressure: 'Blood Pressure',
  glucose: 'Glucose',
  temperature: 'Temperature',
  weight: 'Weight',
};

const CORE_KEYS = ['intake', 'water', 'sleep', 'supplement', 'mood', 'bowel', 'cycle', 'movement'];
const ADDON_KEYS = ['blood_pressure', 'glucose', 'temperature', 'weight'];

const REQUIRED_FIELDS = [
  'first_name',
  'date_of_birth',
  'sex',
  'primary_goal',
  'dietary_style',
  'eating_window',
  'tracking_keys',
] as const;

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface ProfileData {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  sex?: string;
  primary_goal?: string;
  dietary_style?: string;
  eating_window?: string;
  eating_window_start?: string;
  eating_window_end?: string;
  allergies?: string[];
  symptom_priorities?: string[];
  activity_baseline?: string;
  sleep_schedule?: { bedtime?: string; waketime?: string };
  cycle_details?: { avg_cycle_length?: number; last_period_start?: string };
  notifications?: { daily_nudge?: boolean; weekly_summary?: boolean };
  email_marketing_opt_in?: boolean;
  sms_marketing_opt_in?: boolean;
  onboarding_started_at?: string;
  onboarding_completed_at?: string;
  // Plans Phase 1 body inputs — canonical storage is kg / cm in metadata;
  // display unit is persisted per-user so the Profile UI can render the
  // user's preferred unit without changing the canonical value.
  height_cm?: number;
  height_display_unit?: 'cm' | 'in';
  weight_kg?: number;
  weight_display_unit?: 'kg' | 'lb';
  weight_as_of?: string;
  // Plans Phase 3 — baseline meal schedule template (slot enablement,
  // labels, target times). Plans reads this at generation time; program
  // overrides may add/remove slots but never write concrete times.
  meal_schedule?: MealSchedule;
}

/* ================================================================== */
/*  Shared UI                                                          */
/* ================================================================== */

function SectionCard({
  id,
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  id?: string;
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="overflow-hidden border-b border-white/10 bg-neutral-900 first:border-t sm:border-x sm:first:border-t">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-4 text-left min-h-[60px] transition-colors ${
          expanded ? 'bg-white text-black' : 'bg-neutral-900 text-brand-50'
        }`}
      >
        <div className="flex-1 min-w-0">
          <h2 className={`text-base font-semibold antialiased ${expanded ? 'text-black' : 'text-white'}`}>{title}</h2>
          {!expanded && summary && (
            <p className="text-sm text-white/45 antialiased mt-0.5 truncate">{summary}</p>
          )}
          {expanded && summary && (
            <p className="text-xs text-black/75 antialiased mt-0.5 truncate">{summary}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 ml-3 transition-transform duration-200 ${
            expanded ? 'rotate-180 text-black' : 'text-white/55'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="px-5 pb-5 pt-5 bg-black/5">{children}</div>}
    </section>
  );
}

function SaveBar({
  saving,
  error,
  success,
  onSave,
  onCancel,
}: {
  saving: boolean;
  error?: string;
  success?: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 space-y-2">
      {error && <p className="text-xs text-red-400 antialiased">{error}</p>}
      {success && <p className="text-xs text-green-400 antialiased">Saved</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-full border border-white/10 bg-transparent text-center text-sm font-semibold text-white/65 hover:bg-white/[0.04] hover:text-white/90 transition-colors">
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving} className={btnClass + ' flex-1'}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-[#7aa06d]' : 'bg-white/12'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  );
}

/* ================================================================== */
/*  Section 1: Profile Basics                                          */
/* ================================================================== */

function todayYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

function Section1Basics({
  data,
  onSave,
}: {
  data: ProfileData;
  onSave: (patch: Partial<ProfileData>) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [first, setFirst] = useState(data.first_name ?? '');
  const [last, setLast] = useState(data.last_name ?? '');
  const [dob, setDob] = useState(data.date_of_birth ?? '');
  const [sex, setSex] = useState(data.sex ?? '');

  // Height: canonical cm in metadata, user picks display unit.
  // In `in` mode the UI uses two fields (ft + in). In `cm` mode a
  // single integer field. Canonical round-trip stays in cm.
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>(
    data.height_display_unit ?? 'in',
  );
  const [heightFtInput, setHeightFtInput] = useState<string>('');
  const [heightInInput, setHeightInInput] = useState<string>('');
  const [heightCmInput, setHeightCmInput] = useState<string>('');

  // Weight: canonical kg in metadata, user picks display unit. Display
  // trims a trailing `.0` so 185.0 reads as 185 but 83.9 stays 83.9.
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>(
    data.weight_display_unit ?? 'lb',
  );
  const [weightInput, setWeightInput] = useState<string>(() => {
    if (typeof data.weight_kg !== 'number') return '';
    const unit = data.weight_display_unit ?? 'lb';
    return unit === 'lb'
      ? trimTrailingZero(kgToLb(data.weight_kg), 1)
      : trimTrailingZero(data.weight_kg, 1);
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setFirst(data.first_name ?? '');
    setLast(data.last_name ?? '');
    setDob(data.date_of_birth ?? '');
    setSex(data.sex ?? '');
    const hUnit = data.height_display_unit ?? 'in';
    setHeightUnit(hUnit);
    if (typeof data.height_cm === 'number') {
      const { ft, in: inches } = splitFeetInches(cmToIn(data.height_cm));
      setHeightFtInput(String(ft));
      setHeightInInput(String(inches));
      setHeightCmInput(String(Math.round(data.height_cm)));
    } else {
      setHeightFtInput('');
      setHeightInInput('');
      setHeightCmInput('');
    }
    const wUnit = data.weight_display_unit ?? 'lb';
    setWeightUnit(wUnit);
    if (typeof data.weight_kg === 'number') {
      setWeightInput(
        wUnit === 'lb'
          ? trimTrailingZero(kgToLb(data.weight_kg), 1)
          : trimTrailingZero(data.weight_kg, 1),
      );
    }
  }, [data]);

  // Convert the currently-entered value into the new unit so the user
  // doesn't lose / mutate their input when flipping the unit pill.
  function handleHeightUnitChange(next: 'cm' | 'in') {
    if (next === heightUnit) return;
    if (next === 'in') {
      const cm = Number(heightCmInput);
      if (!Number.isNaN(cm) && heightCmInput !== '' && cm > 0) {
        const { ft, in: inches } = splitFeetInches(cmToIn(cm));
        setHeightFtInput(String(ft));
        setHeightInInput(String(inches));
      }
    } else {
      const ft = Number(heightFtInput || 0);
      const inches = Number(heightInInput || 0);
      const totalIn = feetInchesToTotalInches(ft, inches);
      if (totalIn > 0) {
        setHeightCmInput(String(Math.round(inToCm(totalIn))));
      }
    }
    setHeightUnit(next);
  }

  function handleWeightUnitChange(next: 'kg' | 'lb') {
    if (next === weightUnit) return;
    const parsed = Number(weightInput);
    if (!Number.isNaN(parsed) && weightInput !== '') {
      if (next === 'lb' && weightUnit === 'kg') {
        setWeightInput(trimTrailingZero(kgToLb(parsed), 1));
      } else if (next === 'kg' && weightUnit === 'lb') {
        setWeightInput(trimTrailingZero(lbToKg(parsed), 1));
      }
    }
    setWeightUnit(next);
  }

  const summary = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Not set';

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);

    const patch: Partial<ProfileData> = {
      first_name: first,
      last_name: last,
      date_of_birth: dob,
      sex,
    };

    let heightCm: number | null = null;
    if (heightUnit === 'in') {
      const ft = heightFtInput === '' ? 0 : Number(heightFtInput);
      const inches = heightInInput === '' ? 0 : Number(heightInInput);
      const totalIn = feetInchesToTotalInches(
        Number.isNaN(ft) ? 0 : ft,
        Number.isNaN(inches) ? 0 : inches,
      );
      if (totalIn > 0) heightCm = Math.round(inToCm(totalIn));
    } else {
      const cmParsed = heightCmInput === '' ? null : Number(heightCmInput);
      if (cmParsed !== null && !Number.isNaN(cmParsed) && cmParsed > 0) {
        heightCm = Math.round(cmParsed);
      }
    }
    if (heightCm !== null) {
      patch.height_cm = heightCm;
      patch.height_display_unit = heightUnit;
    }

    const weightParsed = weightInput === '' ? null : Number(weightInput);
    if (weightParsed !== null && !Number.isNaN(weightParsed) && weightParsed > 0) {
      const kg =
        Math.round((weightUnit === 'lb' ? lbToKg(weightParsed) : weightParsed) * 10) /
        10;
      patch.weight_kg = kg;
      patch.weight_display_unit = weightUnit;
      patch.weight_as_of = todayYYYYMMDD();
    }

    const ok = await onSave(patch);
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => { setExpanded(false); setSuccess(false); }, 600);
    } else {
      setError('Failed to save. Please try again.');
    }
  }

  const unitPill = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
      active
        ? 'bg-brand-50/35 text-brand-50'
        : 'bg-[#3b332d] text-brand-50/55 hover:text-brand-50'
    }`;

  return (
    <SectionCard title="Profile Basics" summary={summary} expanded={expanded} onToggle={() => setExpanded(!expanded)}>
      <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>First name</label>
          <input className={inputClass} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input className={inputClass} value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" />
        </div>
        <div>
          <label className={labelClass}>Date of birth</label>
          <input type="date" className={inputClass} value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Sex</label>
          <p className="text-[11px] text-white/30 antialiased mb-2">Used for cycle tracking and related personalization</p>
          <select className={selectClass} value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="">Select…</option>
            {SEX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelClass + ' mb-0'}>Weight</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => handleWeightUnitChange('lb')}
                className={unitPill(weightUnit === 'lb')}
              >
                lb
              </button>
              <button
                type="button"
                onClick={() => handleWeightUnitChange('kg')}
                className={unitPill(weightUnit === 'kg')}
              >
                kg
              </button>
            </div>
          </div>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            className={inputClass}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder={weightUnit === 'lb' ? 'e.g. 180' : 'e.g. 82'}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelClass + ' mb-0'}>Height</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => handleHeightUnitChange('in')}
                className={unitPill(heightUnit === 'in')}
              >
                in
              </button>
              <button
                type="button"
                onClick={() => handleHeightUnitChange('cm')}
                className={unitPill(heightUnit === 'cm')}
              >
                cm
              </button>
            </div>
          </div>
          {heightUnit === 'in' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className={inputClass}
                  value={heightFtInput}
                  onChange={(e) => setHeightFtInput(e.target.value)}
                  placeholder="ft"
                  aria-label="Feet"
                />
                <p className="text-[11px] text-white/30 antialiased mt-1">ft</p>
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  max={11}
                  step={1}
                  inputMode="numeric"
                  className={inputClass}
                  value={heightInInput}
                  onChange={(e) => setHeightInInput(e.target.value)}
                  placeholder="in"
                  aria-label="Inches"
                />
                <p className="text-[11px] text-white/30 antialiased mt-1">in</p>
              </div>
            </div>
          ) : (
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className={inputClass}
              value={heightCmInput}
              onChange={(e) => setHeightCmInput(e.target.value)}
              placeholder="e.g. 178"
            />
          )}
          <p className="text-[11px] text-white/30 antialiased mt-1">
            Used for projecting calorie + macro targets in Plans.
          </p>
        </div>
      </div>
      <SaveBar saving={saving} error={error} success={success} onSave={handleSave} onCancel={() => setExpanded(false)} />
    </SectionCard>
  );
}

/* ================================================================== */
/*  Section 2: Goals & Food Preferences                                */
/* ================================================================== */

function Section2Goals({
  data,
  goals,
  onSaveProfile: saveProfile,
  onSaveGoals: saveGoals,
}: {
  data: ProfileData;
  goals: UserGoals | null;
  onSaveProfile: (patch: Partial<ProfileData>) => Promise<boolean>;
  onSaveGoals: (g: { dailyCalorieGoal?: number; macroGoals?: { protein_g?: number; carbs_g?: number; fat_g?: number } }) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [goal, setGoal] = useState(data.primary_goal ?? '');
  const [diet, setDiet] = useState(data.dietary_style ?? '');
  const [window, setWindow] = useState(data.eating_window ?? '');
  const [windowStart, setWindowStart] = useState(data.eating_window_start ?? '');
  const [windowEnd, setWindowEnd] = useState(data.eating_window_end ?? '');
  const [cal, setCal] = useState(goals?.dailyCalorieGoal ?? 2000);
  const [protein, setProtein] = useState(goals?.macroGoals?.protein_g ?? 0);
  const [carbs, setCarbs] = useState(goals?.macroGoals?.carbs_g ?? 0);
  const [fat, setFat] = useState(goals?.macroGoals?.fat_g ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setGoal(data.primary_goal ?? '');
    setDiet(data.dietary_style ?? '');
    setWindow(data.eating_window ?? '');
    setWindowStart(data.eating_window_start ?? '');
    setWindowEnd(data.eating_window_end ?? '');
  }, [data]);

  useEffect(() => {
    if (goals) {
      setCal(goals.dailyCalorieGoal);
      setProtein(goals.macroGoals.protein_g);
      setCarbs(goals.macroGoals.carbs_g);
      setFat(goals.macroGoals.fat_g);
    }
  }, [goals]);

  const summaryParts: string[] = [];
  if (data.primary_goal) summaryParts.push(GOAL_OPTIONS.find((o) => o.value === data.primary_goal)?.label ?? data.primary_goal);
  if (data.dietary_style) summaryParts.push(DIETARY_OPTIONS.find((o) => o.value === data.dietary_style)?.label ?? data.dietary_style);
  const summary = summaryParts.join(' · ') || 'Not set';

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);

    const profilePatch: Partial<ProfileData> = {
      primary_goal: goal,
      dietary_style: diet,
      eating_window: window,
    };
    if (window === 'custom') {
      profilePatch.eating_window_start = windowStart;
      profilePatch.eating_window_end = windowEnd;
    }

    const goalsPatch = {
      dailyCalorieGoal: cal,
      macroGoals: { protein_g: protein, carbs_g: carbs, fat_g: fat },
    };

    const results = await Promise.allSettled([saveProfile(profilePatch), saveGoals(goalsPatch)]);
    const profileOk = results[0].status === 'fulfilled' && results[0].value;
    const goalsOk = results[1].status === 'fulfilled' && results[1].value;

    setSaving(false);
    if (profileOk && goalsOk) {
      setSuccess(true);
      setTimeout(() => { setExpanded(false); setSuccess(false); }, 600);
    } else if (!profileOk && !goalsOk) {
      setError('Failed to save preferences and goals. Please try again.');
    } else if (!profileOk) {
      setError('Goals saved but preferences failed to update — try again.');
    } else {
      setError('Preferences saved but goals failed to update — try again.');
    }
  }

  return (
    <SectionCard title="Goals & Food Preferences" summary={summary} expanded={expanded} onToggle={() => setExpanded(!expanded)}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Primary goal</label>
          <select className={selectClass} value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">Select…</option>
            {GOAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Dietary style</label>
          <select className={selectClass} value={diet} onChange={(e) => setDiet(e.target.value)}>
            <option value="">Select…</option>
            {DIETARY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Eating window</label>
          <select className={selectClass} value={window} onChange={(e) => setWindow(e.target.value)}>
            <option value="">Select…</option>
            {EATING_WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {window === 'custom' && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>Start</label>
              <input type="time" className={inputClass} value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>End</label>
              <input type="time" className={inputClass} value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
            </div>
          </div>
        )}

        <hr className="border-white/[0.06]" />

        <div>
          <label className={labelClass}>Daily calorie goal</label>
          <input type="number" className={inputClass} value={cal} onChange={(e) => setCal(Number(e.target.value))} min={0} step={50} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Protein (g)</label>
            <input type="number" className={inputClass} value={protein} onChange={(e) => setProtein(Number(e.target.value))} min={0} />
          </div>
          <div>
            <label className={labelClass}>Carbs (g)</label>
            <input type="number" className={inputClass} value={carbs} onChange={(e) => setCarbs(Number(e.target.value))} min={0} />
          </div>
          <div>
            <label className={labelClass}>Fat (g)</label>
            <input type="number" className={inputClass} value={fat} onChange={(e) => setFat(Number(e.target.value))} min={0} />
          </div>
        </div>
        {goals?.isDefault && (
          <p className="text-[11px] text-white/30 antialiased">Based on default targets. Adjust to personalize.</p>
        )}
      </div>
      <SaveBar saving={saving} error={error} success={success} onSave={handleSave} onCancel={() => setExpanded(false)} />
    </SectionCard>
  );
}

/* ================================================================== */
/*  Section 2.5: Meal Schedule (Phase 3)                                */
/* ================================================================== */

/**
 * SectionMealSchedule
 *
 * Owns the baseline meal schedule template that Plans reads at plan
 * generation time. Users set slot enablement (breakfast, snacks,
 * lunch, dinner, evening snack) and target clock times. Programs may
 * override structure later (require/disallow), but concrete times
 * always come from this section — that's the locked Phase 3 rule.
 */
function SectionMealSchedule({
  data,
  onSave,
}: {
  data: ProfileData;
  onSave: (patch: Partial<ProfileData>) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);

  const normalized = useMemo(
    () => normalizeMealSchedule(data.meal_schedule ?? defaultMealSchedule()),
    [data.meal_schedule],
  );
  const [slots, setSlots] = useState<Record<MealSlotKey, MealScheduleSlot>>(
    normalized.slots,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSlots(normalizeMealSchedule(data.meal_schedule ?? defaultMealSchedule()).slots);
  }, [data.meal_schedule]);

  function updateSlot(key: MealSlotKey, patch: Partial<MealScheduleSlot>) {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);
    const nextSchedule: MealSchedule = {
      version: 1,
      slots,
      updated_at: new Date().toISOString(),
    };
    const ok = await onSave({ meal_schedule: nextSchedule });
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        setExpanded(false);
        setSuccess(false);
      }, 600);
    } else {
      setError('Failed to save meal schedule. Please try again.');
    }
  }

  const enabledCount = MEAL_SLOT_KEYS.filter((k) => slots[k].enabled).length;
  const summary = `${enabledCount} meal${enabledCount === 1 ? '' : 's'}/day`;

  return (
    <SectionCard
      title="Meal Schedule"
      summary={summary}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    >
      <div className="space-y-3">
        <p className="text-[11px] text-white/40 antialiased">
          Your baseline meal times. Plans uses these when it generates a
          day. Programs can add or remove slots, but the clock times
          always come from here.
        </p>

        <div className="space-y-2">
          {MEAL_SLOT_KEYS.map((key) => {
            const slot = slots[key];
            const defaultLabel = MEAL_SLOT_DEFAULT_LABELS[key];
            return (
              <div
                key={key}
                className="rounded-lg bg-brand-700/40 p-3 flex items-center gap-3"
              >
                <Toggle
                  checked={slot.enabled}
                  onChange={(v) => updateSlot(key, { enabled: v })}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white antialiased">
                    {slot.label ?? defaultLabel}
                  </p>
                </div>
                <input
                  type="time"
                  value={slot.target_time}
                  disabled={!slot.enabled}
                  onChange={(e) =>
                    updateSlot(key, { target_time: e.target.value })
                  }
                  className="px-3 py-2 rounded-lg bg-brand-700 text-brand-50 text-sm disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                />
              </div>
            );
          })}
        </div>

        <SaveBar
          saving={saving}
          error={error}
          success={success}
          onSave={handleSave}
          onCancel={() => {
            setSlots(
              normalizeMealSchedule(data.meal_schedule ?? defaultMealSchedule()).slots,
            );
            setExpanded(false);
          }}
        />
      </div>
    </SectionCard>
  );
}

/* ================================================================== */
/*  Section 3: Tracking Preferences                                    */
/* ================================================================== */

function Section3Tracking({
  keys,
  onSave,
}: {
  keys: string[];
  onSave: (keys: string[]) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState<string[]>(keys);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => setLocal(keys), [keys]);

  function toggle(key: string) {
    setLocal((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const summary = `${keys.length} active`;

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);
    const ok = await onSave(local);
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => { setExpanded(false); setSuccess(false); }, 600);
    } else {
      setError('Failed to save. Please try again.');
    }
  }

  function TrackingToggle({ keyName }: { keyName: string }) {
    const active = local.includes(keyName);
    return (
      <button
        type="button"
        onClick={() => toggle(keyName)}
        className={`flex items-center justify-between w-full px-4 py-3 rounded-lg transition-colors ${
          active ? 'bg-white/[0.06]' : 'bg-white/[0.02]'
        }`}
      >
        <span className={`text-sm antialiased ${active ? 'text-white' : 'text-white/40'}`}>
          {TRACKING_KEY_LABELS[keyName] ?? keyName}
        </span>
        <Toggle checked={active} onChange={() => toggle(keyName)} />
      </button>
    );
  }

  return (
    <SectionCard id="tracking-prefs" title="Tracking Preferences" summary={summary} expanded={expanded} onToggle={() => setExpanded(!expanded)}>
      <div className="space-y-2">
        <p className="text-xs text-white/40 antialiased mb-3">Core</p>
        {CORE_KEYS.map((k) => (
          <TrackingToggle key={k} keyName={k} />
        ))}
        <p className="text-xs text-white/40 antialiased mb-3 mt-4">Add-ons</p>
        {ADDON_KEYS.map((k) => (
          <TrackingToggle key={k} keyName={k} />
        ))}
      </div>
      <SaveBar saving={saving} error={error} success={success} onSave={handleSave} onCancel={() => setExpanded(false)} />
    </SectionCard>
  );
}

/* ================================================================== */
/*  Section 4: Health Context                                          */
/* ================================================================== */

function Section4Health({
  data,
  onSave,
}: {
  data: ProfileData;
  onSave: (patch: Partial<ProfileData>) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);

  const [allergies, setAllergies] = useState<string[]>(data.allergies ?? []);
  const [allergyInput, setAllergyInput] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>(data.symptom_priorities ?? []);
  const [activity, setActivity] = useState(data.activity_baseline ?? '');
  const [bedtime, setBedtime] = useState(data.sleep_schedule?.bedtime ?? '');
  const [waketime, setWaketime] = useState(data.sleep_schedule?.waketime ?? '');
  const [cycleLen, setCycleLen] = useState(data.cycle_details?.avg_cycle_length ?? 28);
  const [lastPeriod, setLastPeriod] = useState(data.cycle_details?.last_period_start ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setAllergies(data.allergies ?? []);
    setSymptoms(data.symptom_priorities ?? []);
    setActivity(data.activity_baseline ?? '');
    setBedtime(data.sleep_schedule?.bedtime ?? '');
    setWaketime(data.sleep_schedule?.waketime ?? '');
    setCycleLen(data.cycle_details?.avg_cycle_length ?? 28);
    setLastPeriod(data.cycle_details?.last_period_start ?? '');
  }, [data]);

  const summaryParts: string[] = [];
  if (allergies.length) summaryParts.push(`${allergies.length} allerg${allergies.length === 1 ? 'y' : 'ies'}`);
  if (symptoms.length) summaryParts.push(`${symptoms.length} symptom${symptoms.length === 1 ? '' : 's'}`);
  if (activity) summaryParts.push(ACTIVITY_OPTIONS.find((o) => o.value === activity)?.label ?? activity);
  const summary = summaryParts.join(' · ') || 'All optional';

  function addAllergy() {
    const val = allergyInput.trim();
    if (val && !allergies.includes(val)) {
      setAllergies([...allergies, val]);
    }
    setAllergyInput('');
  }

  function toggleSymptom(s: string) {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);

    const patch: Partial<ProfileData> = {
      allergies,
      symptom_priorities: symptoms,
      activity_baseline: activity || undefined,
      sleep_schedule: bedtime || waketime ? { bedtime, waketime } : undefined,
    };
    if (data.sex === 'female') {
      patch.cycle_details = { avg_cycle_length: cycleLen, last_period_start: lastPeriod || undefined };
    }

    const ok = await onSave(patch);
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => { setExpanded(false); setSuccess(false); }, 600);
    } else {
      setError('Failed to save. Please try again.');
    }
  }

  return (
    <SectionCard title="Health Context" summary={summary} expanded={expanded} onToggle={() => setExpanded(!expanded)}>
      <div className="space-y-5">
        {/* Allergies */}
        <div>
          <label className={labelClass}>Allergies / intolerances</label>
          <div className="flex gap-2 mb-2">
            <input
              className={inputClass + ' flex-1'}
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllergy(); } }}
              placeholder="Type and press Enter"
            />
            <button type="button" onClick={addAllergy} className="px-4 py-2 rounded-lg bg-white/[0.06] text-sm text-white/60 hover:text-white transition-colors">
              Add
            </button>
          </div>
          {allergies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allergies.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-sm text-white/70 antialiased">
                  {a}
                  <button type="button" onClick={() => setAllergies(allergies.filter((x) => x !== a))} className="text-white/30 hover:text-white/60" aria-label={`Remove ${a}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Symptom priorities */}
        <div>
          <label className={labelClass}>Symptom priorities</label>
          <div className="flex flex-wrap gap-2">
            {SYMPTOM_OPTIONS.map((s) => {
              const active = symptoms.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSymptom(s)}
                  className={`px-3 py-1.5 rounded-full text-sm antialiased border transition-colors ${
                    active
                      ? 'bg-denim-500/20 border-denim-500/40 text-denim-300'
                      : 'bg-white/[0.04] border-white/[0.06] text-white/50'
                  }`}
                >
                  {s.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Activity baseline */}
        <div>
          <label className={labelClass}>Activity baseline</label>
          <select className={selectClass} value={activity} onChange={(e) => setActivity(e.target.value)}>
            <option value="">Select…</option>
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Sleep schedule */}
        <div>
          <label className={labelClass}>Sleep schedule</label>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-white/30 antialiased mb-1 block">Bedtime</label>
              <input type="time" className={inputClass} value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-white/30 antialiased mb-1 block">Wake time</label>
              <input type="time" className={inputClass} value={waketime} onChange={(e) => setWaketime(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Cycle details — only when sex is female */}
        {data.sex === 'female' && (
          <div>
            <label className={labelClass}>Cycle tracking</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-white/30 antialiased mb-1 block">Avg. cycle length (days)</label>
                <input type="number" className={inputClass} value={cycleLen} onChange={(e) => setCycleLen(Number(e.target.value))} min={20} max={45} />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-white/30 antialiased mb-1 block">Last period start</label>
                <input type="date" className={inputClass} value={lastPeriod} onChange={(e) => setLastPeriod(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>
      <SaveBar saving={saving} error={error} success={success} onSave={handleSave} onCancel={() => setExpanded(false)} />
    </SectionCard>
  );
}

/* ================================================================== */
/*  Section 5: Notifications                                           */
/* ================================================================== */

function Section5Notifications({
  data,
  onSave,
}: {
  data: ProfileData;
  onSave: (patch: Partial<ProfileData>) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [emailMkt, setEmailMkt] = useState(data.email_marketing_opt_in ?? false);
  const [smsMkt, setSmsMkt] = useState(data.sms_marketing_opt_in ?? false);
  const [nudge, setNudge] = useState(data.notifications?.daily_nudge ?? false);
  const [weekly, setWeekly] = useState(data.notifications?.weekly_summary ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setEmailMkt(data.email_marketing_opt_in ?? false);
    setSmsMkt(data.sms_marketing_opt_in ?? false);
    setNudge(data.notifications?.daily_nudge ?? false);
    setWeekly(data.notifications?.weekly_summary ?? false);
  }, [data]);

  const activeCount = [emailMkt, smsMkt, nudge, weekly].filter(Boolean).length;
  const summary = activeCount > 0 ? `${activeCount} active` : 'All off';

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);
    const ok = await onSave({
      email_marketing_opt_in: emailMkt,
      sms_marketing_opt_in: smsMkt,
      notifications: { daily_nudge: nudge, weekly_summary: weekly },
    });
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => { setExpanded(false); setSuccess(false); }, 600);
    } else {
      setError('Failed to save. Please try again.');
    }
  }

  function Row({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="flex items-center justify-between py-2.5">
        <span className="text-sm text-white/70 antialiased">{label}</span>
        <Toggle checked={checked} onChange={onChange} />
      </div>
    );
  }

  return (
    <SectionCard title="Notifications" summary={summary} expanded={expanded} onToggle={() => setExpanded(!expanded)}>
      <div className="space-y-1">
        <p className="text-xs text-white/40 antialiased font-semibold uppercase tracking-wider mb-2">Marketing</p>
        <Row label="Receive emails about programs and offers" checked={emailMkt} onChange={setEmailMkt} />
        <Row label="Receive SMS updates" checked={smsMkt} onChange={setSmsMkt} />

        <hr className="border-white/[0.06] my-3" />

        <p className="text-xs text-white/40 antialiased font-semibold uppercase tracking-wider mb-2">Reminders</p>
        <Row label="Remind me to log daily" checked={nudge} onChange={setNudge} />
        <Row label="Send a weekly activity summary" checked={weekly} onChange={setWeekly} />
      </div>
      <SaveBar saving={saving} error={error} success={success} onSave={handleSave} onCancel={() => setExpanded(false)} />
    </SectionCard>
  );
}

/* ================================================================== */
/*  Section 6: Summary Tile Preferences                                */
/* ================================================================== */

function Section6Tiles({ keys }: { keys: string[] }) {
  return (
    <section className="border-b border-white/10 bg-neutral-900 px-5 py-4 sm:border-x">
      <h2 className="text-base font-semibold text-white antialiased mb-3">Summary Tiles</h2>
      {keys.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {keys.map((k) => (
            <span
              key={k}
              className="inline-block rounded-full bg-white/12 px-4 py-1 text-xs text-white/55 antialiased"
            >
              {TRACKING_KEY_LABELS[k] ?? k}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/40 antialiased mb-3">No tracking categories enabled yet.</p>
      )}
      <a
        href="#tracking-prefs"
        className="text-sm text-white/55 hover:text-white/80 transition-colors antialiased"
      >
        These match your tracking preferences. Adjust them above.
      </a>
    </section>
  );
}

/* ================================================================== */
/*  Section 7: Program Context                                         */
/* ================================================================== */

function Section7Programs() {
  return (
    <section className="border-b border-white/10 bg-neutral-900 px-5 py-4 sm:border-x">
      <h2 className="text-base font-semibold text-white antialiased mb-1">Programs</h2>
      <p className="text-sm text-white/55 antialiased mb-2">
        When you join a program, your protocol and recommendations will show up here.
      </p>
      <p className="text-sm text-white/40 antialiased mb-3">
        Programs connect your profile to structured guidance.
      </p>
      <Link
        href="/programs"
        className="text-sm text-white/80 hover:text-white transition-colors antialiased"
      >
        See available programs →
      </Link>
    </section>
  );
}

/* ================================================================== */
/*  Section 8: Profile Completion                                      */
/* ================================================================== */

function Section8Completion({ data, trackingKeys }: { data: ProfileData; trackingKeys: string[] }) {
  const missing: string[] = [];
  if (!data.first_name) missing.push('First name');
  if (!data.date_of_birth) missing.push('Date of birth');
  if (!data.sex) missing.push('Sex');
  if (!data.primary_goal) missing.push('Primary goal');
  if (!data.dietary_style) missing.push('Dietary style');
  if (!data.eating_window) missing.push('Eating window');
  if (!trackingKeys.length) missing.push('Tracking preferences');

  const total = REQUIRED_FIELDS.length;
  const filled = total - missing.length;
  const pct = Math.round((filled / total) * 100);
  const complete = missing.length === 0;

  return (
    <section className="border-b border-white/10 bg-neutral-900 px-5 py-4 sm:border-x">
      <h2 className="text-base font-semibold text-white antialiased mb-3">Profile Completion</h2>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-white/14 overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-[#7aa06d]' : 'bg-[#7aa06d]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-white/65 antialiased mb-1">{pct}% complete</p>

      {!complete && (
        <div className="space-y-1">
          <p className="text-sm text-white/60 antialiased">
            Complete profile update →
          </p>
          <p className="text-[11px] text-white/30 antialiased uppercase tracking-wider font-semibold mb-1 sr-only">
            Still needed
          </p>
          {missing.map((m) => (
            <p key={m} className="text-xs text-white/50 antialiased">• {m}</p>
          ))}
        </div>
      )}
      {complete && (
        <p className="text-xs text-green-400/70 antialiased">Your profile is complete. Nice work.</p>
      )}
    </section>
  );
}

/* ================================================================== */
/*  Section 9: Account Settings Link                                   */
/* ================================================================== */

function Section9Account() {
  return (
    <Link
      href="/account"
      className="flex items-center justify-between border-b border-white/10 bg-neutral-900 px-5 py-5 group sm:border-x"
    >
      <div>
        <h2 className="text-base font-semibold text-white antialiased">Account &amp; billing</h2>
        <p className="text-sm text-white/50 antialiased mt-0.5">Email, password, subscriptions</p>
      </div>
      <svg
        className="w-5 h-5 text-white/55 group-hover:text-white/80 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */

function ProfilePageHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="border-b border-white/10 bg-neutral-900">
      <div className="relative mx-auto flex h-[74px] w-full max-w-[750px] items-center justify-end px-5">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Go back"
        >
          <span aria-hidden className="text-xl leading-none">←</span>
        </button>
        <h1 className="text-xl font-semibold antialiased">Profile</h1>
      </div>
    </header>
  );
}

export default function JournalProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData>({});
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [trackingKeys, setTrackingKeys] = useState<string[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, goalsRes, trackingRes] = await Promise.allSettled([
        fetch('/api/journal/profile').then((r) => r.json()),
        journalService.getGoals(),
        fetch('/api/journal/tracking-settings').then((r) => r.json()),
      ]);

      if (!mounted.current) return;

      if (profileRes.status === 'fulfilled' && profileRes.value.profile) {
        setProfile(profileRes.value.profile);
      }
      if (goalsRes.status === 'fulfilled') {
        setGoals(goalsRes.value);
      }
      if (trackingRes.status === 'fulfilled' && trackingRes.value.enabled_tracking_keys) {
        setTrackingKeys(trackingRes.value.enabled_tracking_keys);
      }
    } catch (err) {
      console.warn('[JournalProfile] fetch error:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(APP_ROUTES.home);
  }

  /* ── Save handlers ────────────────────────────────────────────── */

  async function saveProfile(patch: Partial<ProfileData>): Promise<boolean> {
    try {
      // Set onboarding_started_at on first save
      if (!profile.onboarding_started_at) {
        (patch as any).onboarding_started_at = new Date().toISOString();
      }

      const res = await fetch('/api/journal/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;

      setProfile((prev) => ({ ...prev, ...patch }));

      // Package 2: Profile is not an onboarding completion writer.
      // Completion is owned exclusively by the onboarding completion path.

      return true;
    } catch {
      return false;
    }
  }

  async function saveGoals(g: {
    dailyCalorieGoal?: number;
    macroGoals?: { protein_g?: number; carbs_g?: number; fat_g?: number };
  }): Promise<boolean> {
    try {
      const res = await fetch('/api/journal/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(g),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.goals) setGoals(data.goals);
      return true;
    } catch {
      return false;
    }
  }

  async function saveTrackingKeys(keys: string[]): Promise<boolean> {
    try {
      const res = await fetch('/api/journal/tracking-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_tracking_keys: keys }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.enabled_tracking_keys) setTrackingKeys(data.enabled_tracking_keys);
      return true;
    } catch {
      return false;
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
        <ProfilePageHeader onBack={handleBack} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/40 antialiased animate-pulse">Loading profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-8">
        <ProfilePageHeader onBack={handleBack} />

      <div className="w-full max-w-[750px] mx-auto px-0 sm:px-5">
          {/* 1 — Basics */}
          <Section1Basics data={profile} onSave={saveProfile} />

          {/* 2 — Goals & Preferences */}
          <Section2Goals data={profile} goals={goals} onSaveProfile={saveProfile} onSaveGoals={saveGoals} />

          {/* 2.5 — Meal Schedule (Phase 3) */}
          <SectionMealSchedule data={profile} onSave={saveProfile} />

          {/* 3 — Tracking */}
          <Section3Tracking keys={trackingKeys} onSave={saveTrackingKeys} />

          {/* 4 — Health Context */}
          <Section4Health data={profile} onSave={saveProfile} />

          {/* 5 — Notifications */}
          <Section5Notifications data={profile} onSave={saveProfile} />

          {/* 6 — Summary Tiles */}
          <Section6Tiles keys={trackingKeys} />

          {/* 7 — Programs */}
          <Section7Programs />

          {/* 8 — Profile Completion */}
          <Section8Completion data={profile} trackingKeys={trackingKeys} />

          {/* 9 — Account Settings */}
          <Section9Account />
        </div>
      </div>
    </div>
  );
}
