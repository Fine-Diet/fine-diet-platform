import {
  BASELINE_PREP_DELIVERY_MODULES,
  BASELINE_WEEK_DELIVERY_MODULES,
} from './baselineDeliveryModules';
import type { ProgramProgressSummary } from './progressTypes';
import {
  getProgramSeriesProgramBySlugs,
  getPublishedProgramSeries,
} from './programSeriesCatalogue';
import type { ProgramLibraryDetail } from './programLibraryServerService';
import type {
  ProgramCapacity,
  ProgramCheckinResponse,
  ProgramCheckinTemplate,
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  ProgramRecommendation,
  ProgramRuntimeSummary,
  ProgramVersion,
} from './runtimeTypes';

export type ProgramPreviewSurface =
  | 'hub'
  | 'public-catalogue'
  | 'public-series'
  | 'public-program'
  | 'app-hub'
  | 'app-detail'
  | 'delivery-modules'
  | 'checkin-panel'
  | 'recommendation-reveal';

export type ProgramPreviewStateId =
  | 'locked'
  | 'access-no-enrollment'
  | 'pre-start'
  | 'active-day-1'
  | 'active-day-7-checkin-due'
  | 'active-day-8'
  | 'active-day-14-checkin-due'
  | 'active-day-15'
  | 'active-day-21-checkin-due'
  | 'day-21-handled-placeholder'
  | 'day-21-handled-recommendation'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface ProgramPreviewStateDefinition {
  id: ProgramPreviewStateId;
  label: string;
  day: number | null;
  description: string;
}

export interface ProgramPreviewRuntime {
  state: ProgramPreviewStateDefinition;
  programSlug: string;
  capacity: ProgramCapacity;
  day: number;
  hasAccess: boolean;
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null;
  libraryDetail: ProgramLibraryDetail;
}

const PREVIEW_NOW = '2026-05-28T12:00:00.000Z';
const BASELINE_PROGRAM_ID = 'preview-program-baseline';
const BASELINE_VERSION_ID = 'preview-version-baseline-v1';
const BASELINE_ENROLLMENT_ID = 'preview-enrollment-baseline';
const BASELINE_PERSON_ID = 'preview-person';

export const PROGRAM_PREVIEW_SURFACES: Array<{
  id: ProgramPreviewSurface;
  label: string;
  description: string;
}> = [
  {
    id: 'public-catalogue',
    label: 'Public catalogue',
    description: 'Fixture render of /programs with interactions disabled.',
  },
  {
    id: 'public-series',
    label: 'Public series page',
    description: 'Fixture render of /programs/[series].',
  },
  {
    id: 'public-program',
    label: 'Public program page',
    description: 'Fixture render of /programs/[series]/[program].',
  },
  {
    id: 'app-hub',
    label: 'App Programs hub',
    description: 'Signed-in hub states without enrollment mutations.',
  },
  {
    id: 'app-detail',
    label: 'App Program detail',
    description: 'Signed-in detail states using preview runtime data.',
  },
  {
    id: 'delivery-modules',
    label: 'Delivery modules',
    description: 'Delivery module layouts with day and capacity controls.',
  },
  {
    id: 'checkin-panel',
    label: 'Check-in panel',
    description: 'Preview-safe Baseline check-in form shell.',
  },
  {
    id: 'recommendation-reveal',
    label: 'Recommendation reveal',
    description: 'Day 21 placeholder and stored recommendation reveal states.',
  },
];

export const PROGRAM_PREVIEW_STATES: ProgramPreviewStateDefinition[] = [
  {
    id: 'locked',
    label: 'No access / locked',
    day: null,
    description: 'No entitlement, assignment, or enrollment exists.',
  },
  {
    id: 'access-no-enrollment',
    label: 'Access, no enrollment',
    day: null,
    description: 'Program access is available but runtime has not started.',
  },
  {
    id: 'pre-start',
    label: 'Pre-start',
    day: 0,
    description: 'Enrollment exists with a future selected start date.',
  },
  {
    id: 'active-day-1',
    label: 'Active day 1',
    day: 1,
    description: 'First active runtime day.',
  },
  {
    id: 'active-day-7-checkin-due',
    label: 'Active day 7, check-in due',
    day: 7,
    description: 'Week 1 check-in is due and unhandled.',
  },
  {
    id: 'active-day-8',
    label: 'Active day 8',
    day: 8,
    description: 'Week 2 content is active after the day 7 check-in.',
  },
  {
    id: 'active-day-14-checkin-due',
    label: 'Active day 14, check-in due',
    day: 14,
    description: 'Week 2 check-in is due and unhandled.',
  },
  {
    id: 'active-day-15',
    label: 'Active day 15',
    day: 15,
    description: 'Week 3 content is active after the day 14 check-in.',
  },
  {
    id: 'active-day-21-checkin-due',
    label: 'Active day 21, check-in due',
    day: 21,
    description: 'Final Baseline check-in is due and unhandled.',
  },
  {
    id: 'day-21-handled-placeholder',
    label: 'Day 21 handled, recommendation placeholder',
    day: 21,
    description: 'Final check-in is handled but no stored recommendation exists.',
  },
  {
    id: 'day-21-handled-recommendation',
    label: 'Day 21 handled, stored recommendation',
    day: 21,
    description: 'Final check-in is handled and a recommendation is available.',
  },
  {
    id: 'paused',
    label: 'Paused',
    day: 9,
    description: 'Enrollment is paused without advancing runtime day.',
  },
  {
    id: 'completed',
    label: 'Completed',
    day: 21,
    description: 'Enrollment is completed and remains informational.',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    day: 5,
    description: 'Enrollment is closed and no longer active.',
  },
];

export const PROGRAM_PREVIEW_CAPACITIES: ProgramCapacity[] = [
  'low',
  'steady',
  'high',
];

export function getProgramPreviewState(
  id: string | null | undefined,
): ProgramPreviewStateDefinition {
  return (
    PROGRAM_PREVIEW_STATES.find((state) => state.id === id) ??
    PROGRAM_PREVIEW_STATES[0]
  );
}

export function getProgramPreviewSurface(
  id: string | null | undefined,
): ProgramPreviewSurface {
  return PROGRAM_PREVIEW_SURFACES.some((surface) => surface.id === id)
    ? (id as ProgramPreviewSurface)
    : 'hub';
}

export function getProgramPreviewCapacity(
  value: string | null | undefined,
): ProgramCapacity {
  return PROGRAM_PREVIEW_CAPACITIES.includes(value as ProgramCapacity)
    ? (value as ProgramCapacity)
    : 'steady';
}

export function getProgramPreviewProgramSlugs(): string[] {
  const slugs = new Set<string>();
  for (const series of getPublishedProgramSeries()) {
    for (const program of series.programs) slugs.add(program.slug);
  }
  return Array.from(slugs).sort();
}

export function getProgramPreviewResolution(programSlug = 'baseline') {
  for (const series of getPublishedProgramSeries()) {
    const resolution = getProgramSeriesProgramBySlugs(series.slug, programSlug);
    if (resolution) return resolution;
  }
  return getProgramSeriesProgramBySlugs('nutrition', 'baseline');
}

function selectedStartForDay(day: number): string {
  if (day <= 0) return '2026-06-02';
  const start = new Date('2026-05-01T00:00:00.000Z');
  start.setUTCDate(start.getUTCDate() + day - 1);
  return start.toISOString().slice(0, 10);
}

function makeVersion(): ProgramVersion {
  return {
    id: BASELINE_VERSION_ID,
    program_id: BASELINE_PROGRAM_ID,
    version_key: 'baseline-v1',
    version_label: 'Baseline v1 preview',
    version_number: 1,
    status: 'published',
    duration_days: 21,
    default_unlock_day: 1,
    published_at: PREVIEW_NOW,
    metadata: { preview: true },
    created_by_user_id: null,
    created_at: PREVIEW_NOW,
    updated_at: PREVIEW_NOW,
  };
}

function makeEnrollment(params: {
  status: ProgramEnrollmentStatus;
  capacity: ProgramCapacity;
  day: number;
}): ProgramEnrollment {
  const completedAt =
    params.status === 'completed' ? '2026-05-21T17:00:00.000Z' : null;
  return {
    id: BASELINE_ENROLLMENT_ID,
    person_id: BASELINE_PERSON_ID,
    program_id: BASELINE_PROGRAM_ID,
    program_slug: 'baseline',
    program_version_id: BASELINE_VERSION_ID,
    source_type: 'admin_grant',
    source_ref: 'program-preview',
    entitlement_key: 'program:baseline',
    assignment_id: null,
    purchase_date: null,
    selected_start_date: selectedStartForDay(params.day),
    started_at: params.day > 0 ? '2026-05-01T08:00:00.000Z' : null,
    completed_at: completedAt,
    status: params.status,
    timezone: 'America/Chicago',
    current_capacity: params.capacity,
    paused_days_total: params.status === 'paused' ? 2 : 0,
    pause_until: params.status === 'paused' ? '2026-05-31' : null,
    input_snapshot_json: { preview: true },
    computed_metrics_snapshot_json: { preview_day: params.day },
    metadata: { preview: true },
    created_by_user_id: null,
    created_at: PREVIEW_NOW,
    updated_at: PREVIEW_NOW,
  };
}

function makeCheckinTemplate(day: number): ProgramCheckinTemplate | null {
  if (![7, 14, 21].includes(day)) return null;
  return {
    id: `preview-baseline-checkin-day-${day}`,
    program_version_id: BASELINE_VERSION_ID,
    checkin_day: day,
    title: `Day ${day} Baseline check-in`,
    description:
      day === 21
        ? 'Final Baseline reflection before the recommendation reveal.'
        : 'Weekly reflection used to keep Baseline grounded in observed signals.',
    prompt_md: null,
    questions_json: [],
    status: 'published',
    metadata: { preview: true },
    created_at: PREVIEW_NOW,
    updated_at: PREVIEW_NOW,
  };
}

function makeCheckinResponse(day: number): ProgramCheckinResponse {
  return {
    id: `preview-baseline-checkin-response-day-${day}`,
    enrollment_id: BASELINE_ENROLLMENT_ID,
    checkin_template_id: `preview-baseline-checkin-day-${day}`,
    checkin_day: day,
    response_status: 'completed',
    response_payload_json: {
      digestion_score: 4,
      energy_score: 3,
      sleep_score: 4,
      stress_score: 2,
      stability_delta: day === 21 ? 1 : undefined,
    },
    skipped_reason: null,
    responded_at: PREVIEW_NOW,
    skipped_at: null,
    input_snapshot_json: { preview: true },
    computed_metrics_snapshot_json: { preview: true },
    metadata: { preview: true },
    created_at: PREVIEW_NOW,
    updated_at: PREVIEW_NOW,
  };
}

function makeRecommendation(): ProgramRecommendation {
  return {
    id: 'preview-baseline-recommendation',
    enrollment_id: BASELINE_ENROLLMENT_ID,
    based_on_checkin_response_id: 'preview-baseline-checkin-response-day-21',
    recommendation_type: 'baseline_day_21_v1',
    program_day: 21,
    status: 'generated',
    recommendation_payload_json: {
      action_type: 'guided_program',
      recommended_step: 'DIGESTIVE_FOUNDATIONS',
      reason_snippet:
        'Signals suggest starting with digestive rhythm support before more specialized experiments.',
      rule_version: 'baseline_recommendation_engine_v1',
    },
    input_snapshot_json: { preview: true },
    computed_metrics_snapshot_json: { preview: true },
    metadata: { preview: true },
    generated_at: PREVIEW_NOW,
    acted_at: null,
    created_at: PREVIEW_NOW,
    updated_at: PREVIEW_NOW,
  };
}

function statusForState(stateId: ProgramPreviewStateId): ProgramEnrollmentStatus {
  if (stateId === 'pre-start') return 'pre_start';
  if (stateId === 'paused') return 'paused';
  if (stateId === 'completed') return 'completed';
  if (stateId === 'cancelled') return 'cancelled';
  return 'active';
}

function makeRuntimeSummary(params: {
  state: ProgramPreviewStateDefinition;
  capacity: ProgramCapacity;
  day: number;
}): ProgramRuntimeSummary | null {
  if (params.state.id === 'locked' || params.state.id === 'access-no-enrollment') {
    return null;
  }

  const status = statusForState(params.state.id);
  const checkinTemplate = makeCheckinTemplate(params.day);
  const handledDay21 = params.state.id.startsWith('day-21-handled');
  const priorHandledCheckin =
    params.day === 8 ? 7 : params.day === 15 ? 14 : null;
  const latestResponse = handledDay21
    ? makeCheckinResponse(21)
    : priorHandledCheckin
      ? makeCheckinResponse(priorHandledCheckin)
      : null;

  return {
    enrollment: makeEnrollment({
      status,
      capacity: params.capacity,
      day: params.day,
    }),
    version: makeVersion(),
    program: {
      id: BASELINE_PROGRAM_ID,
      slug: 'baseline',
      title: 'Baseline',
      tagline: 'Your 21-day starting rhythm',
      description:
        'Establish meal rhythm, observe patterns, and create a starting point for future recommendations.',
      storefront_href: '/programs/nutrition/baseline',
    },
    resolved_status: status,
    current_day: params.day,
    timezone: 'America/Chicago',
    next_checkin_template: checkinTemplate,
    latest_checkin_response: latestResponse,
    latest_recommendation:
      params.state.id === 'day-21-handled-recommendation'
        ? makeRecommendation()
        : null,
    resolved_at: PREVIEW_NOW,
  };
}

function makeProgressSummary(day: number): ProgramProgressSummary {
  const modules = [
    {
      module_id: 'preview-baseline-prep',
      items_total: 3,
      items_completed: day >= 1 ? 3 : 0,
      items_in_progress: day <= 0 ? 0 : 0,
      item_states: [
        {
          content_item_id: 'preview-baseline-prep-orientation',
          status: day >= 1 ? ('completed' as const) : ('not_started' as const),
          last_viewed_at: day >= 1 ? PREVIEW_NOW : null,
        },
      ],
    },
    {
      module_id: 'preview-baseline-week',
      items_total: 6,
      items_completed: Math.min(6, Math.max(0, Math.floor(day / 4))),
      items_in_progress: day > 0 && day < 21 ? 1 : 0,
      item_states: [
        {
          content_item_id: 'preview-baseline-week-focus',
          status:
            day >= 21
              ? ('completed' as const)
              : day > 0
                ? ('in_progress' as const)
                : ('not_started' as const),
          last_viewed_at: day > 0 ? PREVIEW_NOW : null,
        },
      ],
    },
  ];
  const completed = modules.reduce((sum, module) => sum + module.items_completed, 0);
  const total = modules.reduce((sum, module) => sum + module.items_total, 0);
  return {
    program_slug: 'baseline',
    items_total: total,
    items_completed: completed,
    items_in_progress: modules.reduce(
      (sum, module) => sum + module.items_in_progress,
      0,
    ),
    percent_complete: Math.round((completed / total) * 100),
    aggregate_status:
      completed === total ? 'completed' : completed > 0 ? 'in_progress' : 'not_started',
    modules,
    resume_content_item_id:
      completed === total ? null : 'preview-baseline-week-focus',
    resume_module_id: completed === total ? null : 'preview-baseline-week',
    last_viewed_at: day > 0 ? PREVIEW_NOW : null,
  };
}

function makeLibraryDetail(params: {
  programSlug: string;
  hasAccess: boolean;
  summary: ProgramRuntimeSummary | null;
}): ProgramLibraryDetail {
  const resolution = getProgramPreviewResolution(params.programSlug);
  const program = resolution?.program;
  const title = program?.title ?? 'Baseline';
  const description =
    program?.description ??
    'Establish meal rhythm, observe patterns, and create a starting point for future recommendations.';

  return {
    slug: params.programSlug,
    title,
    tagline: program?.subtitle ?? null,
    description,
    is_catalogue_stub: true,
    storefront_href: resolution
      ? `/programs/${resolution.series.slug}/${resolution.program.slug}`
      : null,
    has_entitlement: params.hasAccess,
    access_state: params.hasAccess ? 'entitled' : 'unavailable',
    primary_assignment: params.summary
      ? {
          id: 'preview-assignment',
          status:
            params.summary.resolved_status === 'completed'
              ? 'completed'
              : params.summary.resolved_status === 'cancelled'
                ? 'cancelled'
                : 'active',
          runtime_state:
            params.summary.resolved_status === 'pre_start'
              ? 'scheduled'
              : params.summary.resolved_status === 'completed'
                ? 'completed'
                : params.summary.resolved_status === 'cancelled'
                  ? 'cancelled'
                  : 'active_now',
          active_from: params.summary.enrollment.selected_start_date,
          active_to: null,
          acquisition_source: 'admin_grant',
        }
      : null,
    runtime_state: params.summary
      ? params.summary.resolved_status === 'pre_start'
        ? 'scheduled'
        : params.summary.resolved_status === 'completed'
          ? 'completed'
          : params.summary.resolved_status === 'cancelled'
            ? 'cancelled'
            : 'active_now'
      : 'none',
    impact_headline: params.summary
      ? 'Baseline preview is shaping the program state in this admin fixture.'
      : null,
    progress: null,
    assignments: [],
    modules: [
      {
        id: 'preview-baseline-prep',
        title: 'Prep and orientation',
        kind: 'guidance',
        summary: 'Prepare for the Baseline rhythm.',
        estimated_minutes: 8,
      },
      {
        id: 'preview-baseline-weekly',
        title: 'Weekly rhythm',
        kind: 'milestone',
        summary: 'Week-by-week Baseline delivery modules.',
        estimated_minutes: 15,
      },
    ],
    managed_content: {
      id: BASELINE_PROGRAM_ID,
      slug: params.programSlug,
      title,
      tagline: program?.subtitle ?? null,
      description,
      storefront_href: resolution
        ? `/programs/${resolution.series.slug}/${resolution.program.slug}`
        : null,
      modules: [
        {
          id: 'preview-baseline-prep',
          title: 'Prep and orientation',
          description: 'Preview managed content structure before day 1.',
          ordinal: 1,
          items: [
            {
              id: 'preview-baseline-prep-orientation',
              item_type: 'guidance',
              title: 'How Baseline works',
              summary: 'A short orientation for the 21-day program.',
              body: 'Baseline starts with a simple rhythm and uses weekly check-ins to keep the program grounded in observed patterns.',
              video_url: null,
              video_provider: null,
              estimated_minutes: 6,
              ordinal: 1,
            },
          ],
        },
        {
          id: 'preview-baseline-week',
          title: 'Weekly practice',
          description: 'Preview weekly delivery and check-in content.',
          ordinal: 2,
          items: [
            {
              id: 'preview-baseline-week-focus',
              item_type: 'article',
              title: 'Today’s Baseline focus',
              summary: 'Use the current day and capacity to choose the smallest useful step.',
              body: 'This fixture item exists only for preview and does not write progress.',
              video_url: null,
              video_provider: null,
              estimated_minutes: 10,
              ordinal: 1,
            },
          ],
        },
      ],
    },
    impact_bullets: params.summary
      ? [
          {
            kind: 'notes',
            text: 'Preview impact bullet: Baseline is currently active in this fixture.',
          },
        ]
      : [],
    progress_summary: params.summary ? makeProgressSummary(params.summary.current_day) : null,
  };
}

export function resolveProgramPreviewRuntime(params?: {
  stateId?: string | null;
  capacity?: string | null;
  day?: number | null;
  programSlug?: string | null;
}): ProgramPreviewRuntime {
  const state = getProgramPreviewState(params?.stateId);
  const capacity = getProgramPreviewCapacity(params?.capacity);
  const defaultDay = state.day ?? 1;
  const day =
    typeof params?.day === 'number' && Number.isFinite(params.day)
      ? Math.min(21, Math.max(0, Math.round(params.day)))
      : defaultDay;
  const programSlug = params?.programSlug?.trim() || 'baseline';
  const hasAccess = state.id !== 'locked';
  const runtimeSummary = makeRuntimeSummary({ state, capacity, day });

  return {
    state,
    programSlug,
    capacity,
    day,
    hasAccess,
    runtimeSummary,
    progressSummary: runtimeSummary ? makeProgressSummary(day) : null,
    libraryDetail: makeLibraryDetail({
      programSlug,
      hasAccess,
      summary: runtimeSummary,
    }),
  };
}

export const PROGRAM_PREVIEW_DELIVERY_MODULES = [
  ...BASELINE_PREP_DELIVERY_MODULES,
  ...BASELINE_WEEK_DELIVERY_MODULES,
];
