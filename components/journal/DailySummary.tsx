'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { SummaryRowModule, StatusLevel } from '@/lib/summaryRowTypes';
import type { JournalEntry, WaterPayload, MoodPayload, BowelPayload, MovementPayload, CyclePayload, BloodPressurePayload, SleepPayload, SupplementPayload } from '@/lib/journal';
import { calculateDailyTotals, toDateKey } from '@/lib/journal';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

interface TileImageConfig {
  image: string;
}

interface DailySummaryProps {
  date: Date;
  entries: JournalEntry[];
  enabledKeys: string[];
  waterGoalOz?: number;
  tileImages?: Record<string, TileImageConfig>;
}

const INTENSITY_LABELS: Record<number, string> = { 1: 'light', 2: 'moderate', 3: 'vigorous' };

type TrackingModuleKey =
  | 'intake'
  | 'water'
  | 'sleep'
  | 'supplement'
  | 'mood'
  | 'bowel'
  | 'cycle'
  | 'movement'
  | 'blood_pressure'
  | 'glucose'
  | 'weight';

const TRACKING_MODULE_ORDER: TrackingModuleKey[] = [
  'intake',
  'water',
  'sleep',
  'supplement',
  'mood',
  'bowel',
  'cycle',
  'movement',
  'blood_pressure',
  'glucose',
  'weight',
];

const DEFAULT_TRACKING_MODULES: TrackingModuleKey[] = [
  'intake',
  'water',
  'sleep',
  'supplement',
  'mood',
  'bowel',
  'cycle',
  'movement',
];

const TRACKING_KEY_ALIASES: Record<string, TrackingModuleKey> = {
  food: 'intake',
  hydration: 'water',
  supplements: 'supplement',
  bp: 'blood_pressure',
  bloodPressure: 'blood_pressure',
};

const TRACKING_LABELS: Record<TrackingModuleKey, string> = {
  intake: 'Nutrition',
  water: 'Hydration',
  sleep: 'Sleep',
  supplement: 'Supplements',
  mood: 'Mood',
  bowel: 'Bowel',
  cycle: 'Cycle',
  movement: 'Movement',
  blood_pressure: 'Blood Pressure',
  glucose: 'Glucose',
  weight: 'Weight',
};

const TRACKING_ACCENTS: Record<TrackingModuleKey, string> = {
  intake: 'bg-denim-500/15 border-brand-300',
  water: 'bg-[#242b31] border-brand-300',
  sleep: 'bg-[#1f1f1f] border-brand-300',
  supplement: 'bg-[#1d1d11] border-brand-300',
  mood: 'bg-orange-950/35 border-brand-300',
  bowel: 'bg-[#241604] border-brand-300',
  cycle: 'bg-[#1f021c] border-brand-300',
  movement: 'bg-[#111f02] border-brand-300',
  blood_pressure: 'bg-rose-950/35 border-brand-300',
  glucose: 'bg-cyan-950/35 border-brand-300',
  weight: 'bg-brand-800/65 border-brand-300',
};

function normalizeEnabledKeys(keys: string[]): TrackingModuleKey[] {
  const enabled = new Set<TrackingModuleKey>();

  for (const key of keys) {
    const normalized = TRACKING_KEY_ALIASES[key] ?? key;
    if (TRACKING_MODULE_ORDER.includes(normalized as TrackingModuleKey)) {
      enabled.add(normalized as TrackingModuleKey);
    }
  }

  const source = enabled.size > 0 ? enabled : new Set(DEFAULT_TRACKING_MODULES);
  return TRACKING_MODULE_ORDER.filter((key) => source.has(key));
}

function fmt12h(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function statusChip(level: StatusLevel, label: string, reason?: string): { label: string; level: StatusLevel; reason?: string } {
  return { label, level, reason };
}

function buildLogHref(date: Date, tab: string, block?: string): string {
  const dk = toDateKey(date);
  return `${APP_ROUTES.logNew}?date=${dk}&block=${block ?? 'morning'}&tab=${tab}`;
}

function tabForTrackingKey(key: TrackingModuleKey): string {
  if (key === 'intake') return 'food';
  if (key === 'supplement') return 'supplements';
  return key;
}

function byType(entries: JournalEntry[], type: string): JournalEntry[] {
  return entries.filter((e) => e.type === type);
}

function buildNutritionTile(date: Date, entries: JournalEntry[]): SummaryRowModule {
  const intakeEntries = byType(entries, 'intake');
  const logHref = buildLogHref(date, 'food');

  if (intakeEntries.length === 0) {
    return {
      id: 'intake',
      variant: 'summary_row',
      title: 'Nutrition',
      empty: { isEmpty: true, headline: 'No meals logged', body: 'Log your first meal or snack', cta: { label: 'Log Meal', href: logHref } },
      drilldown: { label: 'Log Meal', href: logHref },
    };
  }

  const totals = calculateDailyTotals(entries);
  return {
    id: 'intake',
    variant: 'summary_row',
    title: 'Nutrition',
    status: statusChip('ok', 'Logged'),
    primary: { value: Math.round(totals.caloriesConsumed), unit: 'cal', note: `${intakeEntries.length} item${intakeEntries.length !== 1 ? 's' : ''}` },
    metrics: [
      { label: 'protein', value: Math.round(totals.macrosConsumed.protein), unit: 'g', style: 'number' },
      { label: 'carbs', value: Math.round(totals.macrosConsumed.carbs), unit: 'g', style: 'number' },
    ],
    drilldown: { label: 'Add/Edit', href: logHref },
  };
}

function buildHydrationTile(date: Date, entries: JournalEntry[], goalOz: number): SummaryRowModule {
  const waterEntries = byType(entries, 'water');
  const logHref = buildLogHref(date, 'water');

  if (waterEntries.length === 0) {
    return {
      id: 'water',
      variant: 'summary_row',
      title: 'Hydration',
      empty: { isEmpty: true, headline: 'No water logged', body: 'Tap to log your first glass', cta: { label: 'Log Water', href: logHref } },
      drilldown: { label: 'Log Water', href: logHref },
    };
  }

  const totalOz = waterEntries.reduce((sum, e) => {
    const p = e.payload as WaterPayload;
    return sum + (p.unit === 'ml' ? p.amount / 29.574 : p.amount);
  }, 0);
  const pct = Math.min(100, Math.round((totalOz / goalOz) * 100));
  const last = waterEntries[waterEntries.length - 1];

  let level: StatusLevel = 'ok';
  let statusLabel = 'On track';
  if (pct < 25) { level = 'warn'; statusLabel = 'Behind'; }
  else if (pct >= 100) { statusLabel = 'Goal met'; }

  return {
    id: 'water',
    variant: 'summary_row',
    title: 'Hydration',
    status: statusChip(level, statusLabel),
    primary: { value: Math.round(totalOz), unit: 'oz', note: `${pct}% of goal` },
    metrics: [
      { label: 'progress', value: `${pct}%`, unit: null, style: 'progress' },
      { label: 'last logged', value: fmt12h(last.timestamp), unit: null, style: 'timestamp' },
    ],
    drilldown: { label: 'View Hydration', href: logHref },
  };
}

function buildSleepTile(date: Date, entries: JournalEntry[]): SummaryRowModule {
  const sleepEntries = byType(entries, 'sleep');
  const logHref = buildLogHref(date, 'sleep');

  if (sleepEntries.length === 0) {
    return {
      id: 'sleep',
      variant: 'summary_row',
      title: 'Sleep',
      empty: { isEmpty: true, headline: 'No sleep logged', body: 'Log last night\'s rest', cta: { label: 'Log Sleep', href: logHref } },
      drilldown: { label: 'Log Sleep', href: logHref },
    };
  }

  const totalMin = sleepEntries.reduce((s, e) => s + ((e.payload as SleepPayload).durationMinutes ?? 0), 0);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const qualities = sleepEntries.map((e) => (e.payload as SleepPayload).quality).filter((q): q is 1 | 2 | 3 | 4 | 5 => q != null);
  const avgQuality = qualities.length > 0 ? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length) : null;

  let level: StatusLevel = 'ok';
  let statusLabel = 'Good';
  if (totalMin < 360) { level = 'warn'; statusLabel = 'Low'; }
  else if (totalMin >= 420 && totalMin <= 540) { statusLabel = 'Optimal'; }

  const metrics: SummaryRowModule['metrics'] = [];
  if (avgQuality != null) metrics.push({ label: 'quality', value: `${avgQuality}/5`, unit: null, style: 'number' });
  metrics.push({ label: 'entries', value: sleepEntries.length, unit: null, style: 'number' });

  return {
    id: 'sleep',
    variant: 'summary_row',
    title: 'Sleep',
    status: statusChip(level, statusLabel),
    primary: { value: `${hrs}h ${mins > 0 ? `${mins}m` : ''}`.trim(), unit: null },
    metrics,
    drilldown: { label: 'View Sleep', href: logHref },
  };
}

function buildSupplementTile(date: Date, entries: JournalEntry[]): SummaryRowModule {
  const supplementEntries = byType(entries, 'supplement');
  const logHref = buildLogHref(date, 'supplements');

  if (supplementEntries.length === 0) {
    return {
      id: 'supplement',
      variant: 'summary_row',
      title: 'Supplements',
      empty: { isEmpty: true, headline: 'No supplements logged', body: 'Track supplements as you take them', cta: { label: 'Log Supplements', href: logHref } },
      drilldown: { label: 'Log Supplements', href: logHref },
    };
  }

  const last = supplementEntries[supplementEntries.length - 1];
  const payload = last.payload as SupplementPayload;
  return {
    id: 'supplement',
    variant: 'summary_row',
    title: 'Supplements',
    status: statusChip('ok', 'Logged'),
    primary: { value: supplementEntries.length, unit: supplementEntries.length === 1 ? 'entry' : 'entries', note: payload.name },
    metrics: [
      { label: 'last logged', value: fmt12h(last.timestamp), unit: null, style: 'timestamp' },
    ],
    drilldown: { label: 'Log Supplements', href: logHref },
  };
}

function buildMoodTile(date: Date, entries: JournalEntry[]): SummaryRowModule {
  const moodEntries = byType(entries, 'mood');
  const logHref = buildLogHref(date, 'mood');

  if (moodEntries.length === 0) {
    return {
      id: 'mood',
      variant: 'summary_row',
      title: 'Mood',
      empty: { isEmpty: true, headline: 'No mood logged', body: 'How are you feeling?', cta: { label: 'Log Mood', href: logHref } },
      drilldown: { label: 'Log Mood', href: logHref },
    };
  }

  const scores = moodEntries.map((e) => (e.payload as MoodPayload).score);
  const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  let level: StatusLevel = 'ok';
  let statusLabel = 'Good';
  if (avg <= 2) { level = 'warn'; statusLabel = 'Low'; }
  else if (avg >= 4) { statusLabel = 'Great'; }
  else { statusLabel = 'Okay'; }

  const metrics: SummaryRowModule['metrics'] = [
    { label: 'range', value: min === max ? `${min}` : `${min}–${max}`, unit: null, style: 'text' },
    { label: 'entries', value: moodEntries.length, unit: null, style: 'number' },
  ];

  return {
    id: 'mood',
    variant: 'summary_row',
    title: 'Mood',
    status: statusChip(level, statusLabel),
    primary: { value: avg, unit: '/ 5' },
    metrics,
    drilldown: { label: 'View Mood', href: logHref },
  };
}

function buildBowelTile(date: Date, entries: JournalEntry[]): SummaryRowModule {
  const bowelEntries = byType(entries, 'bowel');
  const logHref = buildLogHref(date, 'bowel');

  if (bowelEntries.length === 0) {
    return {
      id: 'bowel',
      variant: 'summary_row',
      title: 'Bowel',
      empty: { isEmpty: true, headline: 'No entries', body: 'Track your gut health', cta: { label: 'Log Bowel', href: logHref } },
      drilldown: { label: 'Log Bowel', href: logHref },
    };
  }

  const last = bowelEntries[bowelEntries.length - 1].payload as BowelPayload;
  const bristols = bowelEntries.map((e) => (e.payload as BowelPayload).bristol);
  const avgBristol = Math.round(bristols.reduce((a, b) => a + b, 0) / bristols.length);

  let level: StatusLevel = 'ok';
  let statusLabel = 'Normal';
  if (avgBristol <= 2) { level = 'warn'; statusLabel = 'Hard'; }
  else if (avgBristol >= 6) { level = 'warn'; statusLabel = 'Loose'; }

  const metrics: SummaryRowModule['metrics'] = [
    { label: 'count', value: bowelEntries.length, unit: null, style: 'number' },
  ];

  const urgencies = bowelEntries.map((e) => (e.payload as BowelPayload).urgency).filter((u): u is number => u != null);
  if (urgencies.length > 0) {
    const avgUrg = Math.round((urgencies.reduce((a, b) => a + b, 0) / urgencies.length) * 10) / 10;
    metrics.push({ label: 'avg urgency', value: avgUrg, unit: '/3', style: 'number' });
  }

  return {
    id: 'bowel',
    variant: 'summary_row',
    title: 'Bowel',
    status: statusChip(level, statusLabel),
    primary: { value: `Type ${last.bristol}`, unit: null, note: `avg ${avgBristol}` },
    metrics,
    drilldown: { label: 'View Bowel', href: logHref },
  };
}

function buildMovementTile(date: Date, entries: JournalEntry[]): SummaryRowModule {
  const movEntries = byType(entries, 'movement');
  const logHref = buildLogHref(date, 'movement');

  if (movEntries.length === 0) {
    return {
      id: 'movement',
      variant: 'summary_row',
      title: 'Movement',
      empty: { isEmpty: true, headline: 'No activity', body: 'Log a workout or walk', cta: { label: 'Log Movement', href: logHref } },
      drilldown: { label: 'Log Movement', href: logHref },
    };
  }

  const totalMin = movEntries.reduce((s, e) => s + ((e.payload as MovementPayload).minutes ?? 0), 0);
  const intensities = movEntries.map((e) => (e.payload as MovementPayload).intensity).filter((i): i is 1 | 2 | 3 => i != null);
  const modeIntensity = intensities.length > 0
    ? intensities.sort((a, b) => intensities.filter((v) => v === b).length - intensities.filter((v) => v === a).length)[0]
    : null;
  const last = movEntries[movEntries.length - 1];

  let level: StatusLevel = 'ok';
  let statusLabel = 'Active';
  if (totalMin < 15) { level = 'warn'; statusLabel = 'Light day'; }
  else if (totalMin >= 60) { statusLabel = 'Strong day'; }

  const metrics: SummaryRowModule['metrics'] = [
    { label: 'sessions', value: movEntries.length, unit: null, style: 'number' },
  ];
  if (modeIntensity != null) {
    metrics.push({ label: 'intensity', value: INTENSITY_LABELS[modeIntensity] ?? `${modeIntensity}`, unit: null, style: 'text' });
  }

  return {
    id: 'movement',
    variant: 'summary_row',
    title: 'Movement',
    status: statusChip(level, statusLabel),
    primary: { value: totalMin, unit: 'min' },
    metrics,
    drilldown: { label: 'View Movement', href: logHref },
  };
}

function buildCycleTile(date: Date, entries: JournalEntry[]): SummaryRowModule | null {
  const cycleEntries = byType(entries, 'cycle');
  const logHref = buildLogHref(date, 'cycle');

  if (cycleEntries.length === 0) return null;

  const last = cycleEntries[cycleEntries.length - 1].payload as CyclePayload;
  const allSymptoms = cycleEntries.flatMap((e) => (e.payload as CyclePayload).symptoms ?? []);

  const metrics: SummaryRowModule['metrics'] = [];
  if (last.cycleDay != null) metrics.push({ label: 'cycle day', value: last.cycleDay, unit: null, style: 'number' });
  if (allSymptoms.length > 0) metrics.push({ label: 'symptoms', value: allSymptoms.length, unit: null, style: 'number' });

  return {
    id: 'cycle',
    variant: 'summary_row',
    title: 'Cycle',
    status: statusChip('ok', last.phase ?? 'Logged'),
    primary: { value: last.phase ? last.phase.charAt(0).toUpperCase() + last.phase.slice(1) : 'Logged', unit: null },
    metrics,
    drilldown: { label: 'View Cycle', href: logHref },
  };
}

function buildBloodPressureTile(date: Date, entries: JournalEntry[]): SummaryRowModule {
  const bpEntries = byType(entries, 'blood_pressure');
  const logHref = buildLogHref(date, 'blood_pressure');

  if (bpEntries.length === 0) {
    return {
      id: 'blood_pressure',
      variant: 'summary_row',
      title: 'Blood Pressure',
      empty: { isEmpty: true, headline: 'No readings logged', body: 'Track systolic and diastolic readings', cta: { label: 'Log Blood Pressure', href: logHref } },
      drilldown: { label: 'Log Blood Pressure', href: logHref },
    };
  }

  const last = bpEntries[bpEntries.length - 1];
  const payload = last.payload as BloodPressurePayload;
  return {
    id: 'blood_pressure',
    variant: 'summary_row',
    title: 'Blood Pressure',
    status: statusChip('ok', 'Logged'),
    primary: { value: `${payload.systolic}/${payload.diastolic}`, unit: 'mmHg' },
    metrics: [
      { label: 'entries', value: bpEntries.length, unit: null, style: 'number' },
      { label: 'last logged', value: fmt12h(last.timestamp), unit: null, style: 'timestamp' },
    ],
    drilldown: { label: 'Log Blood Pressure', href: logHref },
  };
}

function buildUnavailableTrackingTile(key: 'glucose' | 'weight', date: Date): SummaryRowModule {
  const label = TRACKING_LABELS[key];
  const logHref = buildLogHref(date, tabForTrackingKey(key));
  return {
    id: key,
    variant: 'summary_row',
    title: label,
    empty: {
      isEmpty: true,
      headline: `No ${label.toLowerCase()} logged`,
      body: `${label} tracking is enabled in your preferences.`,
      cta: { label: `Log ${label}`, href: logHref },
    },
    drilldown: { label: `Log ${label}`, href: logHref },
  };
}

function buildTrackingTile(key: TrackingModuleKey, date: Date, entries: JournalEntry[], waterGoalOz: number): SummaryRowModule {
  switch (key) {
    case 'intake':
      return buildNutritionTile(date, entries);
    case 'water':
      return buildHydrationTile(date, entries, waterGoalOz);
    case 'sleep':
      return buildSleepTile(date, entries);
    case 'supplement':
      return buildSupplementTile(date, entries);
    case 'mood':
      return buildMoodTile(date, entries);
    case 'bowel':
      return buildBowelTile(date, entries);
    case 'cycle':
      return buildCycleTile(date, entries) ?? {
        id: 'cycle',
        variant: 'summary_row',
        title: 'Cycle',
        empty: { isEmpty: true, headline: 'No entries today', body: 'Log your cycle', cta: { label: 'Log Cycle', href: buildLogHref(date, 'cycle') } },
        drilldown: { label: 'Log Cycle', href: buildLogHref(date, 'cycle') },
      };
    case 'movement':
      return buildMovementTile(date, entries);
    case 'blood_pressure':
      return buildBloodPressureTile(date, entries);
    case 'glucose':
    case 'weight':
      return buildUnavailableTrackingTile(key, date);
  }
}

/* ── More Today Chips ──────────────────────────────────────────── */

interface ChipData {
  id: string;
  label: string;
  detail?: string;
  href: string | null;
  disabled?: boolean;
}

function buildChips(date: Date, entries: JournalEntry[], enabledKeys: string[]): ChipData[] {
  const dk = toDateKey(date);
  const chips: ChipData[] = [];
  const enabled = new Set(normalizeEnabledKeys(enabledKeys));

  if (enabled.has('supplement')) {
    const suppCount = byType(entries, 'supplement').length;
    chips.push({
      id: 'supplements',
      label: 'Supplements',
      detail: suppCount > 0 ? `${suppCount} logged` : 'Add',
      href: `${APP_ROUTES.logNew}?date=${dk}&block=morning&tab=supplements`,
    });
  }

  chips.push({
    id: 'medication',
    label: 'Medication',
    detail: 'Coming soon',
    href: null,
    disabled: true,
  });

  const bpEntries = byType(entries, 'blood_pressure');
  if (enabled.has('blood_pressure')) {
    const lastBp = bpEntries.length > 0 ? bpEntries[bpEntries.length - 1].payload as BloodPressurePayload : null;
    chips.push({
      id: 'blood_pressure',
      label: 'Blood Pressure',
      detail: lastBp ? `${lastBp.systolic}/${lastBp.diastolic}` : 'Add',
      href: `${APP_ROUTES.logNew}?date=${dk}&block=morning&tab=blood_pressure`,
    });
  }

  const noteCount = byType(entries, 'note').length;
  chips.push({
    id: 'notes',
    label: 'Notes',
    detail: noteCount > 0 ? `${noteCount} note${noteCount !== 1 ? 's' : ''}` : 'Add',
    href: `${APP_ROUTES.logNew}?date=${dk}&block=morning&tab=note`,
  });

  return chips;
}

/* ── Main Component ────────────────────────────────────────────── */

function getTrackingKeyFromModule(moduleId: string): TrackingModuleKey {
  return (TRACKING_KEY_ALIASES[moduleId] ?? moduleId) as TrackingModuleKey;
}

function TrackingModuleCard({ module }: { module: SummaryRowModule }) {
  const isEmpty = module.empty?.isEmpty ?? false;
  const href = isEmpty && module.empty?.cta?.href
    ? module.empty.cta.href
    : module.drilldown?.href ?? APP_ROUTES.logNew;
  const key = getTrackingKeyFromModule(module.id);
  const accent = TRACKING_ACCENTS[key] ?? TRACKING_ACCENTS.intake;

  return (
    <div className="space-y-2">
      <h3 className="text-brand-50 font-semibold text-xl antialiased mb-6">{module.title}</h3>
      <Link href={href} className="group block">
        <article className={`min-h-[150px] rounded-2xl border ${accent} p-5 shadow-large backdrop-blur-md transition-colors group-hover:border-brand-300`}>
          <div className="flex h-full flex-col justify-between gap-4">
            

            {isEmpty && module.empty ? (
              <div>
                <p className="text-lg font-semibold text-brand-50 antialiased">{module.empty.headline ?? `No ${module.title.toLowerCase()} logged`}</p>
                {module.empty.body && (
                  <p className="mt-1 text-sm font-light text-brand-50/65 antialiased">{module.empty.body}</p>
                )}
              </div>
            ) : (
              <div>
                {module.primary && (
                  <p className="text-5xl font-regular leading-none text-brand-50 antialiased mt-1">
                    {module.primary.value}
                    {module.primary.unit != null && <span className="text-lg ml-1 text-base font-regular">{module.primary.unit}</span>}
                  </p>
                )}
                
                {module.metrics && module.metrics.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {module.metrics.slice(0, 2).map((metric) => (
                      <span key={metric.label} className="text-sm text-brand-50/75">
                        <span className="font-semibold">{metric.value}{metric.unit != null ? metric.unit : ''}</span>
                        <span className="font-light"> {metric.label}</span>
                      </span>
                    ))}
                  </div>
                )}
                {module.status && (
              <div className="flex items-start">
                <span className="text-sm font-semibold text-brand-50/75 mt-1">
                  <span className="font-light">Status: </span> {module.status.label}
                </span>
              </div>
            )}  
              </div>
            )}

            <div className="inline-flex w-full items-center justify-center rounded-full border border-brand-300 mb-1 px-4 py-2 text-base font-semibold text-brand-50/85 transition-colors group-hover:bg-denim-500 group-hover:text-black">
              {isEmpty ? module.empty?.cta?.label ?? `Log ${module.title}` : module.drilldown?.label ?? `View ${module.title}`}
            </div>
          </div>
        </article>
      </Link>
    </div>
  );
}

export function DailySummary({ date, entries, enabledKeys, waterGoalOz = 64, tileImages }: DailySummaryProps) {
  const primaryTiles = useMemo(() => {
    const raw = normalizeEnabledKeys(enabledKeys)
      .filter((key) => key !== 'intake')
      .map((key) => buildTrackingTile(key, date, entries, waterGoalOz));

    if (!tileImages) return raw;
    return raw.map((tile) => {
      const img = tileImages[tile.id]?.image ?? (tile.id === 'water' ? tileImages.hydration?.image : undefined);
      return img ? { ...tile, image: img } : tile;
    });
  }, [date, entries, enabledKeys, waterGoalOz, tileImages]);

  return (
    <div className="w-full">
      {/* Primary tracking modules */}
      <div className="mx-auto w-full max-w-[750px]">
        <div className="grid grid-cols-1 gap-7">
          {primaryTiles.map((tile) => (
            <TrackingModuleCard key={tile.id} module={tile} />
          ))}
        </div>
      </div>
    </div>
  );
}
