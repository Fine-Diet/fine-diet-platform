'use client';

/**
 * Generic, registry-driven program check-in panel (P1a).
 *
 * Renders the check-in for ANY runtime program by resolving its question set
 * (presentation-rich questions_json → code question-set registry → degraded
 * contract-only fallback) and building the response payload generically.
 *
 * Baseline resolves to its extracted code question set, so the rendered UI and
 * the submitted payload are identical to the former BaselineCheckinPanel.
 */

import { useMemo, useState } from 'react';
import type {
  ProgramCheckinResponseResult,
  ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';
import type { CheckinQuestion } from '@/lib/programs/checkin/checkinQuestionTypes';
import {
  buildCheckinPayload,
  type CheckinResponses,
} from '@/lib/programs/checkin/checkinPayload';
import {
  getCheckinEyebrow,
  resolveCheckinQuestions,
} from '@/lib/programs/checkin/checkinQuestionSetRegistry';

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: CheckinQuestion;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  const hasOptions = question.options.length > 0;
  return (
    <label className="block rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
      <span className="text-xs font-semibold text-white">{question.label}</span>
      {question.help && (
        <span className="mt-0.5 block text-[11px] text-white/45">
          {question.help}
        </span>
      )}
      {hasOptions ? (
        <select
          value={value}
          onChange={(event) => onChange(question.key, event.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-brand-900 px-3 py-2 text-sm text-white focus:border-denim-300 focus:outline-none"
        >
          <option value="">Choose one</option>
          {question.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={question.input === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(event) => onChange(question.key, event.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-brand-900 px-3 py-2 text-sm text-white focus:border-denim-300 focus:outline-none"
        />
      )}
    </label>
  );
}

export function ProgramCheckinPanel({
  runtimeSummary,
  onHandled,
  previewMode = false,
}: {
  runtimeSummary: ProgramRuntimeSummary;
  onHandled: (summary: ProgramRuntimeSummary) => void;
  previewMode?: boolean;
}) {
  const template = runtimeSummary.next_checkin_template;
  const programSlug = runtimeSummary.program.slug;
  const [responses, setResponses] = useState<CheckinResponses>({});
  const [submitting, setSubmitting] = useState<'completed' | 'skipped' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const eyebrow = getCheckinEyebrow(programSlug);
  const questions = useMemo(
    () => resolveCheckinQuestions({ programSlug, template }),
    [programSlug, template],
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
                ? buildCheckinPayload(questions, responses)
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
              ? buildCheckinPayload(questions, responses)
              : undefined,
          skipped_reason:
            responseStatus === 'skipped'
              ? // Preserve the exact Baseline annotation for back-compat; other
                // programs get the generic wording.
                programSlug === 'baseline'
                ? 'User skipped from Baseline check-in panel.'
                : 'User skipped from program check-in panel.'
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
      setError(
        err instanceof Error ? err.message : 'Could not save this check-in.',
      );
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
            {eyebrow}
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
        {questions.map((question) => (
          <QuestionField
            key={question.key}
            question={question}
            value={responses[question.key] ?? ''}
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
