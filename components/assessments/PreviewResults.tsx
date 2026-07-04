/**
 * PreviewResults
 *
 * Lightweight, in-memory results screen shown at the end of a runtime preview
 * run. It reads the scoring already computed by AssessmentProvider (no DB
 * fetch, no submission_id) and surfaces enough for an editor/admin to verify
 * the preview revision scores correctly end-to-end.
 *
 * Importantly, this screen writes nothing to the database: no submission, no
 * email capture, no webhook. It is a diagnostic view only.
 */

import React from 'react';
import Link from 'next/link';
import { useAssessment } from './AssessmentProvider';
import { getAssessmentLabel } from '@/lib/assessments/assessmentRegistry';

export function PreviewResults() {
  const { state, config } = useAssessment();
  const assessmentLabel = getAssessmentLabel(config.assessmentType);

  const scoreEntries = Object.entries(state.scoreMap).sort((a, b) => b[1] - a[1]);

  return (
    <section className="min-h-screen bg-brand-900 px-6 py-16 text-white antialiased sm:px-10">
      <div className="mx-auto w-full max-w-[680px]">
        <div className="rounded-[24px] border border-amber-300/40 bg-amber-100/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Preview complete — not recorded
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            {assessmentLabel} · preview results
          </h1>
          <p className="mt-4 text-sm text-white/80">
            This run used an unpublished question-set revision. No submission,
            email capture, or webhook was created. Scores below were computed
            in-browser from the preview revision.
          </p>
        </div>

        <div className="mt-8 rounded-[24px] bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white/90">Scoring</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-white/60">Primary avatar</dt>
              <dd className="mt-1 text-xl font-semibold">{state.primaryAvatar || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-white/60">Secondary avatar</dt>
              <dd className="mt-1 text-xl font-semibold">{state.secondaryAvatar || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-white/60">Confidence score</dt>
              <dd className="mt-1 text-xl font-semibold">
                {state.confidenceScore.toFixed(2)}
                {state.confidenceLabel ? ` · ${state.confidenceLabel}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/60">Secondary modifier</dt>
              <dd className="mt-1 text-xl font-semibold">{state.secondaryModifier || '—'}</dd>
            </div>
          </dl>

          {scoreEntries.length > 0 && (
            <div className="mt-6">
              <p className="text-sm text-white/60">Raw score map</p>
              <ul className="mt-2 space-y-1 text-sm text-white/80">
                {scoreEntries.map(([avatar, score]) => (
                  <li key={avatar} className="flex items-center justify-between gap-4">
                    <span>{avatar}</span>
                    <span className="font-mono">{score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/admin/question-sets"
            className="inline-flex items-center justify-center rounded-full bg-denim-500 px-6 py-3 text-sm font-bold text-neutral-900 transition-colors hover:bg-denim-300"
          >
            Back to admin
          </Link>
          <Link
            href={`/assessments/${config.assessmentType}`}
            className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Exit preview
          </Link>
        </div>
      </div>
    </section>
  );
}
