'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { journalService, type UserGoals } from '@/lib/journal';

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const inputClass =
  'w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30';
const selectClass =
  'w-full px-4 pr-10 py-3 rounded-lg bg-brand-700 text-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-200/30 appearance-none';
const labelClass = 'block text-brand-50/80 text-sm font-medium mb-1.5';
const btnClass =
  'w-full py-3 rounded-full bg-brand-200 text-brand-900 font-semibold hover:bg-brand-100 transition-colors disabled:opacity-50';

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
    <section id={id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left min-h-[56px]"
      >
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white antialiased">{title}</h2>
          {!expanded && summary && (
            <p className="text-xs text-white/40 antialiased mt-0.5 truncate">{summary}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-white/30 flex-shrink-0 ml-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="px-5 pb-5 pt-1 border-t border-white/[0.04]">{children}</div>}
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
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-full border border-white/10 text-sm text-white/60 hover:text-white/80 transition-colors">
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
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-dark_accent-500' : 'bg-white/10'}`}
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setFirst(data.first_name ?? '');
    setLast(data.last_name ?? '');
    setDob(data.date_of_birth ?? '');
    setSex(data.sex ?? '');
  }, [data]);

  const summary = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Not set';

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);
    const ok = await onSave({ first_name: first, last_name: last, date_of_birth: dob, sex });
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => { setExpanded(false); setSuccess(false); }, 600);
    } else {
      setError('Failed to save. Please try again.');
    }
  }

  return (
    <SectionCard title="Profile Basics" summary={summary} expanded={expanded} onToggle={() => setExpanded(!expanded)}>
      <div className="space-y-4">
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
                      ? 'bg-dark_accent-500/20 border-dark_accent-500/40 text-dark_accent-300'
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
    <section className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-5 py-4">
      <h2 className="text-sm font-semibold text-white antialiased mb-3">Summary Tiles</h2>
      {keys.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {keys.map((k) => (
            <span
              key={k}
              className="inline-block rounded-full bg-dark_accent-500/10 border border-dark_accent-500/20 px-3 py-1 text-xs text-dark_accent-300 antialiased"
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
        className="text-xs text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
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
    <section className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-5 py-4">
      <h2 className="text-sm font-semibold text-white antialiased mb-1">Programs</h2>
      <p className="text-xs text-white/40 antialiased mb-1">
        When you join a program, your protocol and recommendations will show up here.
      </p>
      <p className="text-[11px] text-white/30 antialiased mb-4">
        Programs connect your profile to structured guidance.
      </p>
      <Link
        href="/programs"
        className="text-xs text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
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
    <section className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-5 py-4">
      <h2 className="text-sm font-semibold text-white antialiased mb-3">Profile Completion</h2>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-green-500' : 'bg-dark_accent-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-white/50 antialiased mb-3">{pct}% complete</p>

      {!complete && (
        <div className="space-y-1">
          <p className="text-[11px] text-white/30 antialiased uppercase tracking-wider font-semibold mb-1">
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
      className="flex items-center justify-between bg-white/[0.04] border border-white/[0.06] rounded-xl px-5 py-4 group"
    >
      <div>
        <h2 className="text-sm font-semibold text-white antialiased">Account &amp; billing</h2>
        <p className="text-xs text-white/40 antialiased mt-0.5">Email, password, subscriptions</p>
      </div>
      <svg
        className="w-4 h-4 text-white/30 group-hover:text-white/50 transition-colors"
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

export default function JournalProfilePage() {
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

      // Check if profile is now complete; mark onboarding_completed_at
      const merged = { ...profile, ...patch };
      const nowComplete =
        merged.first_name &&
        merged.date_of_birth &&
        merged.sex &&
        merged.primary_goal &&
        merged.dietary_style &&
        merged.eating_window &&
        trackingKeys.length > 0;

      if (nowComplete && !profile.onboarding_completed_at) {
        fetch('/api/journal/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onboarding_completed_at: new Date().toISOString() }),
        }).catch(() => {});
      }

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
      <div className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/40 antialiased animate-pulse">Loading profile…</p>
        </div>
        <JournalFooterNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* Page header */}
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <h1 className="text-2xl font-semibold antialiased">Profile</h1>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            Health &amp; personalization
          </p>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 space-y-4 mt-6">
          {/* 1 — Basics */}
          <Section1Basics data={profile} onSave={saveProfile} />

          {/* 2 — Goals & Preferences */}
          <Section2Goals data={profile} goals={goals} onSaveProfile={saveProfile} onSaveGoals={saveGoals} />

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

      <JournalFooterNav />
    </div>
  );
}
