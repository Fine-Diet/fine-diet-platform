import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { BaselineCheckinPanel } from '@/components/journal/programs/BaselineCheckinPanel';
import { ProgramDeliveryModules } from '@/components/journal/programs/ProgramDeliveryModules';
import { PROGRAMS_MVP_CATEGORIES } from '@/lib/programs/appProgramsMvp';
import {
  PROGRAM_PREVIEW_DELIVERY_MODULES,
  type ProgramPreviewRuntime,
} from '@/lib/programs/programPreviewFixtures';
import {
  formatRecommendedStepLabel,
  getRecommendationRevealDetails,
  isBaselineCheckinDue,
  isDay21Handled,
  resolveBaselineCardRuntimeState,
  resolveBaselineDetailRuntimeState,
  shouldShowRecommendationReveal,
} from '@/lib/programs/runtimeUi';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';

interface ProgramStatePreviewProps {
  preview: ProgramPreviewRuntime;
  showFooter: boolean;
  mode:
    | 'app-hub'
    | 'app-detail'
    | 'delivery-modules'
    | 'checkin-panel'
    | 'recommendation-reveal';
}

function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ready' | 'active' | 'paused' | 'complete' | 'locked';
}) {
  const toneClass = {
    neutral: 'border-white/12 bg-white/[0.08] text-white/78',
    ready: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
    active: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100',
    paused: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
    complete: 'border-brand-50/30 bg-brand-50/15 text-brand-50',
    locked: 'border-white/12 bg-white/[0.06] text-white/62',
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}

function AppHubPreview({ preview }: { preview: ProgramPreviewRuntime }) {
  const baseline = PROGRAMS_MVP_CATEGORIES.flatMap((category) =>
    category.series.flatMap((series) => series.programs),
  ).find((program) => program.slug === 'baseline');
  const state = resolveBaselineCardRuntimeState({
    hasAccess: preview.hasAccess,
    summary: preview.runtimeSummary,
  });

  const tone =
    state === 'locked'
      ? 'locked'
      : state === 'start_ready' || state === 'pre_start'
        ? 'ready'
        : state === 'active'
          ? 'active'
          : state === 'paused'
            ? 'paused'
            : state === 'completed'
              ? 'complete'
              : 'locked';

  return (
    <section className="rounded-[2rem] bg-[#17100c] p-5 text-white shadow-large">
      <p className="text-xs uppercase tracking-[0.2em] text-white/45">
        /app/programs hub preview
      </p>
      <h2 className="mt-2 text-2xl font-semibold">Start Your Nutrition Journey</h2>
      <article className="relative isolate mt-5 min-h-[190px] overflow-hidden rounded-[1.35rem] bg-brand-800">
        {baseline?.imageUrl && (
          <Image
            src={baseline.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="650px"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/58 to-black/22" />
        <div className="relative z-10 flex min-h-[190px] flex-col justify-end px-5 pb-4 pt-16">
          <h3 className="text-3xl font-semibold">Baseline</h3>
          <p className="mt-2 max-w-xl text-sm leading-snug text-white/86">
            Establish your starting rhythm and nutrition-density baseline.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone={tone}>
              {state === 'locked'
                ? 'Locked'
                : state === 'start_ready'
                  ? 'Program access active'
                  : state === 'pre_start'
                    ? 'Pre-start'
                    : state === 'active'
                      ? `Day ${preview.day}`
                      : state}
            </Pill>
            <Pill>Fixture only</Pill>
          </div>
          <p className="mt-3 text-sm leading-snug text-white/72">
            {state === 'locked'
              ? 'No access state: public options remain available, but app runtime stays locked.'
              : state === 'start_ready'
                ? 'Access is active with no runtime enrollment. The production start flow is not mounted in preview.'
                : 'Runtime copy follows the selected fixture state without writing enrollment data.'}
          </p>
        </div>
      </article>
    </section>
  );
}

function RuntimeHeader({
  preview,
  runtimeSummary,
}: {
  preview: ProgramPreviewRuntime;
  runtimeSummary: ProgramRuntimeSummary | null;
}) {
  return (
    <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/45">
            Program delivery
          </p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight text-white">
            {preview.libraryDetail.title}
          </h1>
          <p className="mt-2 text-sm leading-snug text-white/65">
            {preview.libraryDetail.tagline ?? preview.libraryDetail.description}
          </p>
        </div>
        <Pill
          tone={
            preview.state.id === 'locked'
              ? 'locked'
              : runtimeSummary?.resolved_status === 'active'
                ? 'active'
                : runtimeSummary?.resolved_status === 'paused'
                  ? 'paused'
                  : runtimeSummary?.resolved_status === 'completed'
                    ? 'complete'
                    : 'ready'
          }
        >
          {preview.state.label}
        </Pill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric
          label="Selected start"
          value={runtimeSummary?.enrollment.selected_start_date ?? 'Not enrolled'}
        />
        <Metric
          label="Current day"
          value={runtimeSummary ? `Day ${runtimeSummary.current_day}` : 'N/A'}
        />
        <Metric label="Capacity" value={preview.capacity} />
        <Metric
          label="Progress"
          value={
            preview.progressSummary
              ? `${preview.progressSummary.percent_complete}%`
              : 'No progress'
          }
        />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function RecommendationReveal({
  runtimeSummary,
}: {
  runtimeSummary: ProgramRuntimeSummary | null;
}) {
  const details = getRecommendationRevealDetails(
    runtimeSummary?.latest_recommendation ?? null,
  );

  return (
    <section className="rounded-3xl border border-brand-50/20 bg-brand-50/[0.07] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-brand-50/75">
            Recommendation reveal
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-white">
            Baseline Day 21 next-step placeholder
          </h2>
        </div>
        <Pill tone="complete">Day 21</Pill>
      </div>

      {details ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Metric label="Action type" value={details.actionType ?? 'Not set'} />
          <Metric
            label="Recommended step"
            value={formatRecommendedStepLabel(details.recommendedStep)}
          />
          <Metric label="Status" value={details.status} />
          <Metric label="Reason" value={details.reasonSnippet ?? 'Not set'} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
          <p className="text-sm font-semibold text-white">
            Your next step is being prepared.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            Fine Diet will use your Baseline signals to suggest the next best
            path.
          </p>
        </div>
      )}
    </section>
  );
}

function DetailStatePreview({ preview }: { preview: ProgramPreviewRuntime }) {
  const [runtimeSummary, setRuntimeSummary] = useState(preview.runtimeSummary);
  const detailState = resolveBaselineDetailRuntimeState({
    inLibrary: true,
    hasAccess: preview.hasAccess,
    summary: runtimeSummary,
  });
  const checkinDue = isBaselineCheckinDue(runtimeSummary);
  const day21Handled = isDay21Handled(runtimeSummary);

  return (
    <div className="space-y-5">
      <RuntimeHeader preview={preview} runtimeSummary={runtimeSummary} />

      {detailState === 'not_in_library' && (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">
            Baseline is not available in this library.
          </p>
        </section>
      )}

      {detailState === 'start_ready' && (
        <section className="rounded-2xl border border-sky-300/15 bg-sky-400/5 p-4">
          <p className="text-sm font-semibold text-white">
            Access active, no enrollment yet.
          </p>
          <p className="mt-1 text-xs leading-snug text-white/60">
            The production start flow is intentionally not mounted here.
          </p>
        </section>
      )}

      {detailState === 'pre_start' && (
        <>
          <section className="rounded-2xl border border-sky-300/15 bg-sky-400/5 p-4">
            <p className="text-sm font-semibold text-white">Prepare for Baseline</p>
            <p className="mt-1 text-xs leading-snug text-white/60">
              Selected start date is set. Use this preview to review prep
              modules.
            </p>
          </section>
          <ProgramDeliveryModules
            runtimeSummary={runtimeSummary}
            progressSummary={preview.progressSummary}
            modules={PROGRAM_PREVIEW_DELIVERY_MODULES.filter(
              (module) =>
                module.moduleType === 'prep' || module.moduleType === 'roadmap',
            )}
          />
        </>
      )}

      {detailState === 'active' && runtimeSummary && (
        <>
          <section className="rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-4">
            <p className="text-sm font-semibold text-white">Continue Baseline</p>
            <p className="mt-1 text-xs leading-snug text-white/60">
              You are on day {runtimeSummary.current_day}. Continue with
              today&apos;s focus and any available content below.
            </p>
          </section>
          <ProgramDeliveryModules
            runtimeSummary={runtimeSummary}
            progressSummary={preview.progressSummary}
            modules={PROGRAM_PREVIEW_DELIVERY_MODULES}
            checkinDue={checkinDue}
            day21Handled={day21Handled}
            anchors={{
              checkin: 'preview-baseline-checkin',
              recommendation: 'preview-baseline-recommendation',
            }}
          />
          {checkinDue && (
            <div id="preview-baseline-checkin">
              <BaselineCheckinPanel
                runtimeSummary={runtimeSummary}
                onHandled={setRuntimeSummary}
                previewMode
              />
            </div>
          )}
          {shouldShowRecommendationReveal(runtimeSummary) && (
            <div id="preview-baseline-recommendation">
              <RecommendationReveal runtimeSummary={runtimeSummary} />
            </div>
          )}
        </>
      )}

      {detailState === 'paused' && (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
          <p className="text-sm font-semibold text-white">Baseline is paused.</p>
          <p className="mt-1 text-xs leading-snug text-white/60">
            Runtime day progression is paused in this fixture.
          </p>
        </section>
      )}

      {detailState === 'completed' && (
        <section className="rounded-2xl border border-brand-50/20 bg-brand-50/10 p-4">
          <p className="text-sm font-semibold text-white">Baseline complete.</p>
          <p className="mt-1 text-xs leading-snug text-white/60">
            Completion state remains informational in preview.
          </p>
        </section>
      )}

      {detailState === 'cancelled' && (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">
            This Baseline enrollment is closed.
          </p>
        </section>
      )}
    </div>
  );
}

export function ProgramStatePreview({
  preview,
  showFooter,
  mode,
}: ProgramStatePreviewProps) {
  const runtimeSummary = preview.runtimeSummary;
  const needsCheckinSummary =
    runtimeSummary?.next_checkin_template != null
      ? runtimeSummary
      : runtimeSummary
        ? {
            ...runtimeSummary,
            next_checkin_template: {
              id: 'preview-baseline-checkin-day-7',
              program_version_id: runtimeSummary.version.id,
              checkin_day: 7,
              title: 'Day 7 Baseline check-in',
              description: 'Preview check-in panel shell.',
              prompt_md: null,
              questions_json: [],
              status: 'published' as const,
              metadata: { preview: true },
              created_at: runtimeSummary.resolved_at,
              updated_at: runtimeSummary.resolved_at,
            },
          }
        : null;

  return (
    <div className="rounded-[2rem] border border-gray-900 bg-brand-900 p-4 text-white shadow-sm">
      <div className="mx-auto max-w-[650px] py-8">
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-white/62">
          <p className="font-semibold text-white">Preview state: {preview.state.label}</p>
          <p className="mt-1">
            {preview.state.description} Program: {preview.programSlug}.
            Capacity: {preview.capacity}. Day: {preview.day}.
          </p>
        </div>

        {mode === 'app-hub' && <AppHubPreview preview={preview} />}
        {mode === 'app-detail' && <DetailStatePreview preview={preview} />}
        {mode === 'delivery-modules' && (
          <ProgramDeliveryModules
            runtimeSummary={runtimeSummary}
            progressSummary={preview.progressSummary}
            modules={PROGRAM_PREVIEW_DELIVERY_MODULES}
            checkinDue={isBaselineCheckinDue(runtimeSummary)}
            day21Handled={isDay21Handled(runtimeSummary)}
            anchors={{
              checkin: 'preview-baseline-checkin',
              recommendation: 'preview-baseline-recommendation',
            }}
          />
        )}
        {mode === 'checkin-panel' &&
          needsCheckinSummary &&
          needsCheckinSummary.next_checkin_template && (
            <BaselineCheckinPanel
              runtimeSummary={needsCheckinSummary}
              onHandled={() => undefined}
              previewMode
            />
          )}
        {mode === 'checkin-panel' && !needsCheckinSummary && (
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-5">
            <p className="text-sm font-semibold text-white">
              Select an enrolled state to preview the check-in panel.
            </p>
            <p className="mt-1 text-xs text-white/55">
              Day 7, day 14, and day 21 check-in states include the production
              panel shell in preview mode.
            </p>
          </div>
        )}
        {mode === 'recommendation-reveal' && (
          <RecommendationReveal runtimeSummary={runtimeSummary} />
        )}
      </div>

      {showFooter && (
        <div className="mx-auto max-w-[650px] border-t border-white/10 py-5 text-center text-xs text-white/45">
          App footer preview placeholder. Production navigation remains
          unchanged.
        </div>
      )}

      <div className="mx-auto max-w-[650px] pb-4 text-center text-[11px] text-white/35">
        <Link href="/app/programs" className="underline">
          Production app route
        </Link>{' '}
        is not bypassed by this admin preview.
      </div>
    </div>
  );
}
