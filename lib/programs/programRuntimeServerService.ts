/**
 * Program Runtime Contract Packet 1 — server-only helpers
 *
 * This service owns the version-locked guided-program runtime read/write
 * contract. It does not mutate catalogue content, Plans guidance, or content
 * progress.
 */

import { hasEntitlement } from '@/lib/access/accessService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { listAssignments } from '@/lib/plans/programAssignmentServerService';
import type {
  CreateProgramEnrollmentInput,
  JsonObject,
  ProgramCapacity,
  ProgramCheckinResponseResult,
  ProgramCheckinResponse,
  ProgramCheckinResponseStatus,
  ProgramCheckinTemplate,
  ProgramCheckinTemplateStatus,
  ProgramEnrollment,
  ProgramEnrollmentSource,
  ProgramEnrollmentStatus,
  ProgramRecommendation,
  ProgramRecommendationStatus,
  ProgramRuntimeSummaryList,
  ProgramRuntimeSummary,
  ProgramVersion,
  ProgramVersionStatus,
  RespondToProgramCheckinInput,
} from './runtimeTypes';

interface ProgramHeaderRow {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  storefront_href: string | null;
}

interface ProgramVersionRow {
  id: string;
  program_id: string;
  version_key: string;
  version_label: string | null;
  version_number: number | null;
  status: ProgramVersionStatus;
  duration_days: number | null;
  default_unlock_day: number | null;
  published_at: string | null;
  metadata: JsonObject | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProgramEnrollmentRow {
  id: string;
  person_id: string;
  program_id: string;
  program_slug: string;
  program_version_id: string;
  source_type: ProgramEnrollmentSource;
  source_ref: string | null;
  entitlement_key: string | null;
  assignment_id: string | null;
  purchase_date: string | null;
  selected_start_date: string;
  started_at: string | null;
  completed_at: string | null;
  status: ProgramEnrollmentStatus;
  timezone: string | null;
  current_capacity: ProgramCapacity | null;
  paused_days_total: number | null;
  pause_until: string | null;
  input_snapshot_json: JsonObject | null;
  computed_metrics_snapshot_json: JsonObject | null;
  metadata: JsonObject | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProgramCheckinTemplateRow {
  id: string;
  program_version_id: string;
  checkin_day: number;
  title: string;
  description: string | null;
  prompt_md: string | null;
  questions_json: unknown[] | null;
  status: ProgramCheckinTemplateStatus;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
}

interface ProgramCheckinResponseRow {
  id: string;
  enrollment_id: string;
  checkin_template_id: string | null;
  checkin_day: number;
  response_status: ProgramCheckinResponseStatus;
  response_payload_json: JsonObject | null;
  skipped_reason: string | null;
  responded_at: string | null;
  skipped_at: string | null;
  input_snapshot_json: JsonObject | null;
  computed_metrics_snapshot_json: JsonObject | null;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
}

interface ProgramRecommendationRow {
  id: string;
  enrollment_id: string;
  based_on_checkin_response_id: string | null;
  recommendation_type: string;
  program_day: number | null;
  status: ProgramRecommendationStatus;
  recommendation_payload_json: JsonObject | null;
  input_snapshot_json: JsonObject | null;
  computed_metrics_snapshot_json: JsonObject | null;
  metadata: JsonObject | null;
  generated_at: string;
  acted_at: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function assertDateKey(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD.`);
  }
  return value;
}

function dateKeyToEpochDay(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const lookup = new Map(parts.map((p) => [p.type, p.value]));
    const year = lookup.get('year');
    const month = lookup.get('month');
    const day = lookup.get('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back below for invalid/unsupported IANA zone strings.
  }
  return date.toISOString().slice(0, 10);
}

function rowToVersion(row: ProgramVersionRow): ProgramVersion {
  return {
    id: row.id,
    program_id: row.program_id,
    version_key: row.version_key,
    version_label: row.version_label,
    version_number: row.version_number ?? 1,
    status: row.status,
    duration_days: row.duration_days,
    default_unlock_day: row.default_unlock_day ?? 1,
    published_at: row.published_at,
    metadata: row.metadata ?? {},
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToEnrollment(row: ProgramEnrollmentRow): ProgramEnrollment {
  return {
    id: row.id,
    person_id: row.person_id,
    program_id: row.program_id,
    program_slug: row.program_slug,
    program_version_id: row.program_version_id,
    source_type: row.source_type,
    source_ref: row.source_ref,
    entitlement_key: row.entitlement_key,
    assignment_id: row.assignment_id,
    purchase_date: row.purchase_date,
    selected_start_date: row.selected_start_date,
    started_at: row.started_at,
    completed_at: row.completed_at,
    status: row.status,
    timezone: row.timezone ?? 'UTC',
    current_capacity: row.current_capacity ?? 'steady',
    paused_days_total: row.paused_days_total ?? 0,
    pause_until: row.pause_until,
    input_snapshot_json: row.input_snapshot_json ?? {},
    computed_metrics_snapshot_json: row.computed_metrics_snapshot_json ?? {},
    metadata: row.metadata ?? {},
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToTemplate(row: ProgramCheckinTemplateRow): ProgramCheckinTemplate {
  return {
    id: row.id,
    program_version_id: row.program_version_id,
    checkin_day: row.checkin_day,
    title: row.title,
    description: row.description,
    prompt_md: row.prompt_md,
    questions_json: row.questions_json ?? [],
    status: row.status,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToResponse(row: ProgramCheckinResponseRow): ProgramCheckinResponse {
  return {
    id: row.id,
    enrollment_id: row.enrollment_id,
    checkin_template_id: row.checkin_template_id,
    checkin_day: row.checkin_day,
    response_status: row.response_status,
    response_payload_json: row.response_payload_json ?? {},
    skipped_reason: row.skipped_reason,
    responded_at: row.responded_at,
    skipped_at: row.skipped_at,
    input_snapshot_json: row.input_snapshot_json ?? {},
    computed_metrics_snapshot_json: row.computed_metrics_snapshot_json ?? {},
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToRecommendation(row: ProgramRecommendationRow): ProgramRecommendation {
  return {
    id: row.id,
    enrollment_id: row.enrollment_id,
    based_on_checkin_response_id: row.based_on_checkin_response_id,
    recommendation_type: row.recommendation_type,
    program_day: row.program_day,
    status: row.status,
    recommendation_payload_json: row.recommendation_payload_json ?? {},
    input_snapshot_json: row.input_snapshot_json ?? {},
    computed_metrics_snapshot_json: row.computed_metrics_snapshot_json ?? {},
    metadata: row.metadata ?? {},
    generated_at: row.generated_at,
    acted_at: row.acted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Returns guided program day in the user's local timezone.
 *
 * Day 1 is the selected_start_date. Dates before start return 0. The helper
 * subtracts paused_days_total so future pause rollups can freeze the journey
 * without rewriting selected_start_date.
 */
export function calculateCurrentProgramDay(args: {
  selectedStartDate: string;
  timezone?: string | null;
  pausedDaysTotal?: number | null;
  now?: Date;
}): number {
  const start = assertDateKey(args.selectedStartDate, 'selectedStartDate');
  const today = dateKeyInTimeZone(args.now ?? new Date(), args.timezone || 'UTC');
  const rawDay = dateKeyToEpochDay(today) - dateKeyToEpochDay(start) + 1;
  if (rawDay <= 0) return 0;
  return Math.max(1, rawDay - Math.max(args.pausedDaysTotal ?? 0, 0));
}

export function resolveEnrollmentStatus(
  enrollment: ProgramEnrollment,
  now: Date = new Date(),
): ProgramEnrollmentStatus {
  if (enrollment.status === 'cancelled') return 'cancelled';
  if (enrollment.status === 'completed' || enrollment.completed_at) {
    return 'completed';
  }

  const today = dateKeyInTimeZone(now, enrollment.timezone || 'UTC');
  if (enrollment.status === 'paused') return 'paused';
  if (enrollment.pause_until && enrollment.pause_until >= today) return 'paused';

  const currentDay = calculateCurrentProgramDay({
    selectedStartDate: enrollment.selected_start_date,
    timezone: enrollment.timezone,
    pausedDaysTotal: enrollment.paused_days_total,
    now,
  });
  return currentDay <= 0 ? 'pre_start' : 'active';
}

async function getProgramBySlug(slug: string): Promise<ProgramHeaderRow | null> {
  const { data, error } = await supabaseAdmin
    .from('programs')
    .select('id, slug, title, tagline, description, storefront_href')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`program lookup failed: ${error.message}`);
  return (data as ProgramHeaderRow | null) ?? null;
}

async function getVersionById(id: string): Promise<ProgramVersion | null> {
  const { data, error } = await supabaseAdmin
    .from('program_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`program version lookup failed: ${error.message}`);
  return data ? rowToVersion(data as ProgramVersionRow) : null;
}

async function getLatestPublishedVersion(
  programId: string,
): Promise<ProgramVersion | null> {
  const { data, error } = await supabaseAdmin
    .from('program_versions')
    .select('*')
    .eq('program_id', programId)
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`program version lookup failed: ${error.message}`);
  return data ? rowToVersion(data as ProgramVersionRow) : null;
}

async function verifyEnrollmentSource(input: {
  personId: string;
  slug: string;
  sourceType: ProgramEnrollmentSource;
  assignmentId?: string | null;
}): Promise<{ assignmentId: string | null; entitlementKey: string | null }> {
  const entitlementKey = `program:${input.slug}`;

  if (input.sourceType === 'admin_grant') {
    return { assignmentId: input.assignmentId ?? null, entitlementKey: null };
  }

  if (input.sourceType === 'entitlement') {
    const allowed = await hasEntitlement(input.personId, entitlementKey);
    if (!allowed) {
      const err = new Error('Person does not hold the required program entitlement.');
      (err as Error & { code?: string }).code = 'PROGRAM_ENTITLEMENT_DENIED';
      throw err;
    }
    return { assignmentId: null, entitlementKey };
  }

  if (input.assignmentId) {
    const { data, error } = await supabaseAdmin
      .from('program_assignments')
      .select('id')
      .eq('id', input.assignmentId)
      .eq('person_id', input.personId)
      .eq('program_slug', input.slug)
      .maybeSingle();
    if (error) throw new Error(`assignment lookup failed: ${error.message}`);
    if (!data) {
      const err = new Error('Program assignment not found for enrollment.');
      (err as Error & { code?: string }).code = 'PROGRAM_ASSIGNMENT_DENIED';
      throw err;
    }
    return { assignmentId: input.assignmentId, entitlementKey: null };
  }

  const { rows } = await listAssignments({
    personId: input.personId,
    programSlug: input.slug,
    limit: 1,
  });
  if (rows.length === 0) {
    const err = new Error('Program assignment not found for enrollment.');
    (err as Error & { code?: string }).code = 'PROGRAM_ASSIGNMENT_DENIED';
    throw err;
  }

  return { assignmentId: rows[0].id, entitlementKey: null };
}

async function resolveEnrollmentSourceFromAccess(input: {
  personId: string;
  slug: string;
}): Promise<{
  sourceType: ProgramEnrollmentSource;
  assignmentId: string | null;
  entitlementKey: string | null;
}> {
  const entitlementKey = `program:${input.slug}`;
  if (await hasEntitlement(input.personId, entitlementKey)) {
    return { sourceType: 'entitlement', assignmentId: null, entitlementKey };
  }

  const { rows } = await listAssignments({
    personId: input.personId,
    programSlug: input.slug,
    limit: 1,
  });
  if (rows.length > 0) {
    return {
      sourceType: 'assignment',
      assignmentId: rows[0].id,
      entitlementKey: null,
    };
  }

  const err = new Error('Person does not have access to this program.');
  (err as Error & { code?: string }).code = 'PROGRAM_ACCESS_DENIED';
  throw err;
}

export async function getActiveEnrollmentForPersonProgram(
  personId: string,
  programSlug: string,
): Promise<ProgramEnrollment | null> {
  const slug = normalizeSlug(programSlug);
  if (!personId || !slug) return null;

  const { data, error } = await supabaseAdmin
    .from('program_enrollments')
    .select('*')
    .eq('person_id', personId)
    .eq('program_slug', slug)
    .in('status', ['pre_start', 'active', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`active enrollment lookup failed: ${error.message}`);
  return data ? rowToEnrollment(data as ProgramEnrollmentRow) : null;
}

export async function listEnrollmentsForPerson(
  personId: string,
): Promise<ProgramEnrollment[]> {
  const { data, error } = await supabaseAdmin
    .from('program_enrollments')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`list enrollments failed: ${error.message}`);
  return ((data ?? []) as ProgramEnrollmentRow[]).map(rowToEnrollment);
}

export async function createProgramEnrollment(
  input: CreateProgramEnrollmentInput,
): Promise<ProgramEnrollment> {
  const slug = normalizeSlug(input.programSlug);
  if (!input.personId) throw new Error('personId is required.');
  if (!slug) throw new Error('programSlug is required.');
  assertDateKey(input.selectedStartDate, 'selectedStartDate');
  if (input.purchaseDate) assertDateKey(input.purchaseDate, 'purchaseDate');

  const existing = await getActiveEnrollmentForPersonProgram(input.personId, slug);
  if (existing) return existing;

  const program = await getProgramBySlug(slug);
  if (!program) throw new Error(`Program '${slug}' was not found.`);

  const version = input.programVersionId
    ? await getVersionById(input.programVersionId)
    : await getLatestPublishedVersion(program.id);
  if (!version || version.program_id !== program.id) {
    throw new Error(`No matching published runtime version for '${slug}'.`);
  }

  const source = await verifyEnrollmentSource({
    personId: input.personId,
    slug,
    sourceType: input.sourceType,
    assignmentId: input.assignmentId,
  });

  const currentDay = calculateCurrentProgramDay({
    selectedStartDate: input.selectedStartDate,
    timezone: input.timezone || 'UTC',
  });
  const status: ProgramEnrollmentStatus = currentDay <= 0 ? 'pre_start' : 'active';
  const nowIso = new Date().toISOString();

  const payload = {
    person_id: input.personId,
    program_id: program.id,
    program_slug: slug,
    program_version_id: version.id,
    source_type: input.sourceType,
    source_ref: input.sourceRef ?? null,
    entitlement_key: input.entitlementKey ?? source.entitlementKey,
    assignment_id: source.assignmentId,
    purchase_date: input.purchaseDate ?? null,
    selected_start_date: input.selectedStartDate,
    started_at: status === 'active' ? nowIso : null,
    status,
    timezone: input.timezone || 'UTC',
    current_capacity: input.currentCapacity ?? 'steady',
    paused_days_total: 0,
    input_snapshot_json: input.inputSnapshot ?? {},
    computed_metrics_snapshot_json: input.computedMetricsSnapshot ?? {},
    metadata: input.metadata ?? {},
    created_by_user_id: input.createdByUserId ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('program_enrollments')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const raced = await getActiveEnrollmentForPersonProgram(input.personId, slug);
      if (raced) return raced;
    }
    throw new Error(`create enrollment failed: ${error.message}`);
  }

  return rowToEnrollment(data as ProgramEnrollmentRow);
}

export async function createProgramEnrollmentFromAccess(
  input: Omit<
    CreateProgramEnrollmentInput,
    'sourceType' | 'assignmentId' | 'entitlementKey'
  >,
): Promise<ProgramEnrollment> {
  const slug = normalizeSlug(input.programSlug);
  const source = await resolveEnrollmentSourceFromAccess({
    personId: input.personId,
    slug,
  });

  return createProgramEnrollment({
    ...input,
    programSlug: slug,
    sourceType: source.sourceType,
    assignmentId: source.assignmentId,
    entitlementKey: source.entitlementKey,
  });
}

async function getCheckinTemplateForDay(
  programVersionId: string,
  checkinDay: number,
): Promise<ProgramCheckinTemplate | null> {
  if (checkinDay <= 0) return null;
  const { data, error } = await supabaseAdmin
    .from('program_checkin_templates')
    .select('*')
    .eq('program_version_id', programVersionId)
    .eq('checkin_day', checkinDay)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(`check-in template lookup failed: ${error.message}`);
  return data ? rowToTemplate(data as ProgramCheckinTemplateRow) : null;
}

async function getLatestCheckinResponse(
  enrollmentId: string,
): Promise<ProgramCheckinResponse | null> {
  const { data, error } = await supabaseAdmin
    .from('program_checkin_responses')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('checkin_day', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`check-in response lookup failed: ${error.message}`);
  return data ? rowToResponse(data as ProgramCheckinResponseRow) : null;
}

async function getLatestRecommendation(
  enrollmentId: string,
): Promise<ProgramRecommendation | null> {
  const { data, error } = await supabaseAdmin
    .from('program_recommendations')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`recommendation lookup failed: ${error.message}`);
  return data ? rowToRecommendation(data as ProgramRecommendationRow) : null;
}

export async function getProgramRuntimeSummary(
  enrollmentId: string,
): Promise<ProgramRuntimeSummary | null> {
  const { data: enrollmentData, error: enrollmentErr } = await supabaseAdmin
    .from('program_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .maybeSingle();
  if (enrollmentErr) {
    throw new Error(`runtime summary enrollment lookup failed: ${enrollmentErr.message}`);
  }
  if (!enrollmentData) return null;

  const enrollment = rowToEnrollment(enrollmentData as ProgramEnrollmentRow);
  const [program, version, latestResponse, latestRecommendation] = await Promise.all([
    getProgramBySlug(enrollment.program_slug),
    getVersionById(enrollment.program_version_id),
    getLatestCheckinResponse(enrollment.id),
    getLatestRecommendation(enrollment.id),
  ]);
  if (!program || !version) return null;

  const currentDay = calculateCurrentProgramDay({
    selectedStartDate: enrollment.selected_start_date,
    timezone: enrollment.timezone,
    pausedDaysTotal: enrollment.paused_days_total,
  });
  const nextTemplate = await getCheckinTemplateForDay(version.id, currentDay);

  return {
    enrollment,
    version,
    program,
    resolved_status: resolveEnrollmentStatus(enrollment),
    current_day: currentDay,
    timezone: enrollment.timezone,
    next_checkin_template: nextTemplate,
    latest_checkin_response: latestResponse,
    latest_recommendation: latestRecommendation,
    resolved_at: new Date().toISOString(),
  };
}

export async function getProgramRuntimeSummaryForPerson(
  personId: string,
  enrollmentId: string,
): Promise<ProgramRuntimeSummary | null> {
  const { data, error } = await supabaseAdmin
    .from('program_enrollments')
    .select('id')
    .eq('id', enrollmentId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) {
    throw new Error(`runtime summary ownership lookup failed: ${error.message}`);
  }
  if (!data) return null;
  return getProgramRuntimeSummary(enrollmentId);
}

export async function listProgramRuntimeSummariesForPerson(
  personId: string,
): Promise<ProgramRuntimeSummaryList> {
  const enrollments = await listEnrollmentsForPerson(personId);
  const summaries = await Promise.all(
    enrollments.map((enrollment) => getProgramRuntimeSummary(enrollment.id)),
  );
  return {
    person_id: personId,
    summaries: summaries.filter((s): s is ProgramRuntimeSummary => Boolean(s)),
    resolved_at: new Date().toISOString(),
  };
}

async function getEnrollmentForPerson(
  personId: string,
  enrollmentId: string,
): Promise<ProgramEnrollment | null> {
  const { data, error } = await supabaseAdmin
    .from('program_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`enrollment ownership lookup failed: ${error.message}`);
  return data ? rowToEnrollment(data as ProgramEnrollmentRow) : null;
}

async function getCheckinTemplateById(
  id: string,
): Promise<ProgramCheckinTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from('program_checkin_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`check-in template lookup failed: ${error.message}`);
  return data ? rowToTemplate(data as ProgramCheckinTemplateRow) : null;
}

export async function respondToProgramCheckin(
  input: RespondToProgramCheckinInput,
): Promise<ProgramCheckinResponseResult> {
  const enrollment = await getEnrollmentForPerson(input.personId, input.enrollmentId);
  if (!enrollment) {
    const err = new Error('Enrollment not found for person.');
    (err as Error & { code?: string }).code = 'PROGRAM_ENROLLMENT_NOT_FOUND';
    throw err;
  }

  let template: ProgramCheckinTemplate | null = null;
  let checkinDay = input.checkinDay ?? null;

  if (input.checkinTemplateId) {
    template = await getCheckinTemplateById(input.checkinTemplateId);
    if (!template || template.program_version_id !== enrollment.program_version_id) {
      const err = new Error('Check-in template does not belong to this enrollment.');
      (err as Error & { code?: string }).code = 'PROGRAM_CHECKIN_TEMPLATE_DENIED';
      throw err;
    }
    checkinDay = template.checkin_day;
  } else if (checkinDay != null) {
    if (!Number.isInteger(checkinDay) || checkinDay < 1) {
      throw new Error('checkin_day must be a positive integer.');
    }
    template = await getCheckinTemplateForDay(
      enrollment.program_version_id,
      checkinDay,
    );
  }

  if (checkinDay == null) {
    throw new Error('Either checkin_template_id or checkin_day is required.');
  }

  const nowIso = new Date().toISOString();
  const payload = {
    enrollment_id: enrollment.id,
    checkin_template_id: template?.id ?? input.checkinTemplateId ?? null,
    checkin_day: checkinDay,
    response_status: input.responseStatus,
    response_payload_json:
      input.responseStatus === 'completed' ? input.responsesJson ?? {} : {},
    skipped_reason:
      input.responseStatus === 'skipped'
        ? input.skippedReason?.trim() || null
        : null,
    responded_at: input.responseStatus === 'completed' ? nowIso : null,
    skipped_at: input.responseStatus === 'skipped' ? nowIso : null,
    input_snapshot_json: input.inputSnapshot ?? {},
    computed_metrics_snapshot_json: input.computedMetricsSnapshot ?? {},
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabaseAdmin
    .from('program_checkin_responses')
    .upsert(payload, { onConflict: 'enrollment_id,checkin_day' })
    .select('*')
    .single();
  if (error) throw new Error(`check-in response upsert failed: ${error.message}`);

  const summary = await getProgramRuntimeSummaryForPerson(
    input.personId,
    enrollment.id,
  );
  if (!summary) {
    throw new Error('Enrollment summary unavailable after check-in response.');
  }

  return {
    response: rowToResponse(data as ProgramCheckinResponseRow),
    summary,
  };
}
