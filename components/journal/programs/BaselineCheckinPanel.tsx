'use client';

import { useMemo, useState } from 'react';
import type {
  ProgramCheckinResponseResult,
  ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';

type BaselineCheckinResponses = Record<string, string>;

const BASELINE_FIELDS = [
  {
    key: 'digestion_score',
    label: 'Digestion score',
    type: 'score',
    help: 'Overall digestive comfort this week.',
  },
  {
    key: 'digestion_modifier',
    label: 'Digestion modifier',
    options: [
      ['better', 'Better than usual'],
      ['same', 'About the same'],
      ['worse', 'Worse than usual'],
      ['variable', 'Variable'],
    ],
  },
  {
    key: 'bm_frequency',
    label: 'BM frequency',
    options: [
      ['daily', 'Daily'],
      ['most_days', 'Most days'],
      ['every_few_days', 'Every few days'],
      ['multiple_daily', 'Multiple times daily'],
      ['variable', 'Variable'],
    ],
  },
  {
    key: 'meals_per_day',
    label: 'Meals per day',
    options: [
      ['1', '1 meal'],
      ['2', '2 meals'],
      ['3', '3 meals'],
      ['4_plus', '4+ meals'],
      ['variable', 'Variable'],
    ],
  },
  {
    key: 'protein_consistency',
    label: 'Protein consistency',
    options: [
      ['low', 'Low'],
      ['moderate', 'Moderate'],
      ['steady', 'Steady'],
      ['high', 'High'],
    ],
  },
  {
    key: 'hunger_pattern',
    label: 'Hunger pattern',
    options: [
      ['steady', 'Steady'],
      ['low_appetite', 'Low appetite'],
      ['early_hunger', 'Hungry soon after meals'],
      ['late_day_hunger', 'Mostly later in the day'],
      ['variable', 'Variable'],
    ],
  },
  {
    key: 'caffeine_use',
    label: 'Caffeine use',
    options: [
      ['none', 'None'],
      ['low', 'Low'],
      ['moderate', 'Moderate'],
      ['high', 'High'],
      ['variable', 'Variable'],
    ],
  },
  {
    key: 'energy_score',
    label: 'Energy score',
    type: 'score',
    help: 'Average usable energy this week.',
  },
  {
    key: 'sleep_score',
    label: 'Sleep score',
    type: 'score',
    help: 'How restorative sleep felt this week.',
  },
  {
    key: 'stress_score',
    label: 'Stress score',
    type: 'score',
    help: 'Overall stress load this week.',
  },
  {
    key: 'cravings_frequency',
    label: 'Cravings frequency',
    options: [
      ['rare', 'Rare'],
      ['occasional', 'Occasional'],
      ['most_days', 'Most days'],
      ['daily', 'Daily'],
      ['variable', 'Variable'],
    ],
  },
  {
    key: 'gi_red_flags',
    label: 'GI red flags',
    options: [
      ['none', 'None this week'],
      ['pain', 'Pain'],
      ['blood', 'Blood'],
      ['vomiting', 'Vomiting'],
      ['unintentional_weight_loss', 'Unintentional weight loss'],
      ['other', 'Other concern'],
    ],
  },
] as const;

const STABILITY_DELTA_FIELD = {
  key: 'stability_delta',
  label: 'Stability delta',
  type: 'delta',
  help: 'Compared with the start of Baseline.',
} as const;

function scoreOptions() {
  return [1, 2, 3, 4, 5].map((value) => [String(value), String(value)] as const);
}

function deltaOptions() {
  return [
    ['-2', 'Much less stable'],
    ['-1', 'A little less stable'],
    ['0', 'About the same'],
    ['1', 'A little more stable'],
    ['2', 'Much more stable'],
  ] as const;
}

function toPayload(
  responses: BaselineCheckinResponses,
  includeStabilityDelta: boolean,
) {
  const keys: string[] = BASELINE_FIELDS.map((field) => field.key);
  if (includeStabilityDelta) keys.push(STABILITY_DELTA_FIELD.key);

  return keys.reduce<Record<string, unknown>>((payload, key) => {
    const value = responses[key] ?? '';
    if (
      key === 'digestion_score' ||
      key === 'energy_score' ||
      key === 'sleep_score' ||
      key === 'stress_score' ||
      key === 'stability_delta'
    ) {
      payload[key] = value === '' ? null : Number(value);
    } else if (key === 'gi_red_flags') {
      payload[key] = value === '' || value === 'none' ? [] : [value];
    } else {
      payload[key] = value === '' ? null : value;
    }
    return payload;
  }, {});
}

function SelectField({
  fieldKey,
  label,
  value,
  options,
  help,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  help?: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
      <span className="text-xs font-semibold text-white">{label}</span>
      {help && <span className="mt-0.5 block text-[11px] text-white/45">{help}</span>}
      <select
        value={value}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-brand-900 px-3 py-2 text-sm text-white focus:border-denim-300 focus:outline-none"
      >
        <option value="">Choose one</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BaselineCheckinPanel({
  runtimeSummary,
  onHandled,
  previewMode = false,
}: {
  runtimeSummary: ProgramRuntimeSummary;
  onHandled: (summary: ProgramRuntimeSummary) => void;
  previewMode?: boolean;
}) {
  const template = runtimeSummary.next_checkin_template;
  const [responses, setResponses] = useState<BaselineCheckinResponses>({});
  const [submitting, setSubmitting] = useState<'completed' | 'skipped' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const includeStabilityDelta = template?.checkin_day === 21;
  const fields = useMemo(
    () =>
      includeStabilityDelta
        ? [...BASELINE_FIELDS, STABILITY_DELTA_FIELD]
        : BASELINE_FIELDS,
    [includeStabilityDelta],
  );

  function updateResponse(key: string, value: string) {
    setResponses((current) => ({ ...current, [key]: value }));
  }

  async function submit(responseStatus: 'completed' | 'skipped') {
    if (!template || submitting) return;
    setSubmitting(responseStatus);
    setError(null);
    try {
      if (previewMode) {
        onHandled({
          ...runtimeSummary,
          latest_checkin_response: {
            id: `preview-checkin-response-${template.checkin_day}`,
            enrollment_id: runtimeSummary.enrollment.id,
            checkin_template_id: template.id,
            checkin_day: template.checkin_day,
            response_status: responseStatus,
            response_payload_json:
              responseStatus === 'completed'
                ? toPayload(responses, includeStabilityDelta)
                : {},
            skipped_reason:
              responseStatus === 'skipped'
                ? 'Preview skipped response. No runtime data was written.'
                : null,
            responded_at:
              responseStatus === 'completed' ? new Date().toISOString() : null,
            skipped_at:
              responseStatus === 'skipped' ? new Date().toISOString() : null,
            input_snapshot_json: { preview: true },
            computed_metrics_snapshot_json: { preview: true },
            metadata: { preview: true },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
        return;
      }

      const resp = await fetch('/api/journal/programs/checkins/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: runtimeSummary.enrollment.person_id,
          enrollment_id: runtimeSummary.enrollment.id,
          checkin_template_id: template.id,
          checkin_day: template.checkin_day,
          response_status: responseStatus,
          responses_json:
            responseStatus === 'completed'
              ? toPayload(responses, includeStabilityDelta)
              : undefined,
          skipped_reason:
            responseStatus === 'skipped'
              ? 'User skipped from Baseline check-in panel.'
              : undefined,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not save this check-in.');
      }
      const result = (await resp.json()) as ProgramCheckinResponseResult;
      onHandled(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this check-in.');
    } finally {
      setSubmitting(null);
    }
  }

  if (!template) return null;

  return (
    <section className="rounded-3xl border border-emerald-300/20 bg-emerald-400/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-emerald-100/75">
            Baseline check-in
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-white">
            {template.title}
          </h2>
          {template.description && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/68">
              {template.description}
            </p>
          )}
        </div>
        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
          Day {template.checkin_day}
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
        <p className="text-sm font-semibold text-white">
          This is information, not a test.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-white/58">
          {previewMode
            ? 'Preview mode uses local fixture state only. It does not save check-in responses.'
            : 'Answer what you can. You can skip and keep moving.'}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <SelectField
            key={field.key}
            fieldKey={field.key}
            label={field.label}
            value={responses[field.key] ?? ''}
            options={
              'type' in field && field.type === 'score'
                ? scoreOptions()
                : 'type' in field && field.type === 'delta'
                  ? deltaOptions()
                  : field.options
            }
            help={'help' in field ? field.help : undefined}
            onChange={updateResponse}
          />
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs text-red-100">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={Boolean(submitting)}
          onClick={() => submit('completed')}
          className="rounded-full bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-900 hover:bg-white disabled:opacity-50"
        >
          {submitting === 'completed' ? 'Saving...' : 'Complete Check-In'}
        </button>
        <button
          type="button"
          disabled={Boolean(submitting)}
          onClick={() => submit('skipped')}
          className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/72 hover:bg-white/[0.09] disabled:opacity-50"
        >
          {submitting === 'skipped' ? 'Skipping...' : 'Skip This Check-In'}
        </button>
      </div>
    </section>
  );
}
