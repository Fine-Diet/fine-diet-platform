import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getProgramRuntimeSummaryForPerson } from './programRuntimeServerService';

export const PROGRAM_DAY_NOT_UNLOCKED = 'PROGRAM_DAY_NOT_UNLOCKED';
export const PROGRAM_DAY_REQUIREMENTS_UNMET = 'PROGRAM_DAY_REQUIREMENTS_UNMET';
export const PROGRAM_DAY_MODULE_NOT_FOUND = 'PROGRAM_DAY_MODULE_NOT_FOUND';
export const PROGRAM_DAY_READ_ONLY = 'PROGRAM_DAY_READ_ONLY';

function codedError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

export function canAccessProgramDay(input: {
  day: number;
  currentDay: number;
  status: string;
  durationDays: number | null;
}): boolean {
  if (input.day < 0 || input.day > input.currentDay) return false;
  if (input.status === 'pre_start' && input.day !== 0) return false;
  return input.durationDays == null || input.day <= input.durationDays;
}

export function hasSavedRequiredObservations(
  requiredKeys: string[],
  observations: Array<{ content_key: string; response_text: string | null }>,
): boolean {
  const savedKeys = new Set(observations
    .filter((row) => typeof row.response_text === 'string' && row.response_text.trim().length > 0)
    .map((row) => row.content_key));
  return requiredKeys.every((key) => savedKeys.has(key));
}

export function isCheckinHandled(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'skipped';
}

async function assertUnlocked(personId: string, enrollmentId: string, day: number) {
  const summary = await getProgramRuntimeSummaryForPerson(personId, enrollmentId);
  if (!summary) throw codedError('Enrollment not found for person.', 'PROGRAM_ENROLLMENT_NOT_FOUND');
  if (!canAccessProgramDay({ day, currentDay: summary.current_day, status: summary.resolved_status, durationDays: summary.version.duration_days })) {
    const message = summary.resolved_status === 'pre_start' && day !== 0
      ? 'Only Day 0 is available before the Program starts.'
      : day > summary.current_day
        ? 'This Program day is not unlocked yet.'
        : 'This Program day is outside the enrolled version.';
    throw codedError(message, PROGRAM_DAY_NOT_UNLOCKED);
  }
  return summary;
}

function assertWritable(summary: NonNullable<Awaited<ReturnType<typeof getProgramRuntimeSummaryForPerson>>>, day: number) {
  const canWriteInLifecycle = summary.resolved_status === 'active'
    || (summary.resolved_status === 'pre_start' && day === 0);
  if (!canWriteInLifecycle) {
    throw codedError('This enrollment is read-only and cannot accept new day responses or completion.', PROGRAM_DAY_READ_ONLY);
  }
}

async function findVersionedModule(
  summary: NonNullable<Awaited<ReturnType<typeof getProgramRuntimeSummaryForPerson>>>,
  day: number,
  contentKey: string,
) {
  const { data, error } = await supabaseAdmin
    .from('program_delivery_modules')
    .select('id, module_key, day_start, day_end, metadata')
    .eq('program_id', summary.version.program_id)
    .eq('program_version_id', summary.version.id)
    .eq('status', 'published')
    .eq('module_key', contentKey)
    .maybeSingle();
  if (error) throw new Error(`versioned module lookup failed: ${error.message}`);
  const row = data as { id: string; module_key: string; day_start: number | null; day_end: number | null; metadata: Record<string, unknown> | null } | null;
  if (!row || row.day_start == null || row.day_end == null || day < row.day_start || day > row.day_end) {
    throw codedError('Observation module is not part of this enrolled version and day.', PROGRAM_DAY_MODULE_NOT_FOUND);
  }
  return row;
}

export async function getProgramDayObservation(input: {
  personId: string;
  enrollmentId: string;
  day: number;
  contentKey: string;
}) {
  const summary = await assertUnlocked(input.personId, input.enrollmentId, input.day);
  await findVersionedModule(summary, input.day, input.contentKey);
  const { data, error } = await supabaseAdmin
    .from('program_day_observations')
    .select('draft_text, response_text, saved_at, updated_at')
    .eq('enrollment_id', input.enrollmentId)
    .eq('program_version_id', summary.version.id)
    .eq('program_day', input.day)
    .eq('content_key', input.contentKey)
    .maybeSingle();
  if (error) throw new Error(`day observation lookup failed: ${error.message}`);
  return data ?? { draft_text: '', response_text: null, saved_at: null, updated_at: null };
}

export async function writeProgramDayObservation(input: {
  personId: string;
  enrollmentId: string;
  day: number;
  contentKey: string;
  text: string;
  commit: boolean;
}) {
  const summary = await assertUnlocked(input.personId, input.enrollmentId, input.day);
  assertWritable(summary, input.day);
  await findVersionedModule(summary, input.day, input.contentKey);
  const now = new Date().toISOString();
  const values = {
    enrollment_id: input.enrollmentId,
    program_version_id: summary.version.id,
    program_day: input.day,
    content_key: input.contentKey,
    draft_text: input.text,
    updated_at: now,
    ...(input.commit ? { response_text: input.text, saved_at: now } : {}),
  };
  const { data, error } = await supabaseAdmin
    .from('program_day_observations')
    .upsert(values, { onConflict: 'enrollment_id,program_version_id,program_day,content_key' })
    .select('draft_text, response_text, saved_at, updated_at')
    .single();
  if (error) throw new Error(`day observation save failed: ${error.message}`);
  return data;
}

export async function completeProgramDay(input: {
  personId: string;
  enrollmentId: string;
  day: number;
}) {
  const summary = await assertUnlocked(input.personId, input.enrollmentId, input.day);
  if (summary.resolved_status === 'completed') {
    const existing = await getProgramDayCompletion(input);
    if (existing) return existing;
  }
  assertWritable(summary, input.day);
  const { data: moduleRows, error: modulesError } = await supabaseAdmin
    .from('program_delivery_modules')
    .select('module_key, metadata')
    .eq('program_id', summary.version.program_id)
    .eq('program_version_id', summary.version.id)
    .eq('status', 'published')
    .lte('day_start', input.day)
    .gte('day_end', input.day);
  if (modulesError) throw new Error(`completion requirements lookup failed: ${modulesError.message}`);
  const requiredModules = (moduleRows ?? []).filter((row) =>
    (row.metadata as Record<string, unknown> | null)?.completionRequired === true,
  ) as Array<{ module_key: string }>;

  const { data: observations, error: observationsError } = await supabaseAdmin
    .from('program_day_observations')
    .select('content_key, response_text')
    .eq('enrollment_id', input.enrollmentId)
    .eq('program_version_id', summary.version.id)
    .eq('program_day', input.day);
  if (observationsError) throw new Error(`completion observation lookup failed: ${observationsError.message}`);
  if (!hasSavedRequiredObservations(requiredModules.map((module) => module.module_key), (observations ?? []) as Array<{ content_key: string; response_text: string | null }>)) {
    throw codedError('Save the required observation before completing this day.', PROGRAM_DAY_REQUIREMENTS_UNMET);
  }

  const { data: checkin, error: checkinError } = await supabaseAdmin
    .from('program_checkin_responses')
    .select('response_status, checkin_template_id')
    .eq('enrollment_id', input.enrollmentId)
    .eq('checkin_day', input.day)
    .maybeSingle();
  if (checkinError) throw new Error(`completion check-in lookup failed: ${checkinError.message}`);
  const { data: checkinTemplates, error: templatesError } = await supabaseAdmin
    .from('program_checkin_templates')
    .select('id')
    .eq('program_version_id', summary.version.id)
    .eq('checkin_day', input.day)
    .eq('status', 'published')
    .limit(1);
  if (templatesError) throw new Error(`completion check-in template lookup failed: ${templatesError.message}`);
  const requiredTemplateIds = new Set((checkinTemplates ?? []).map((row) => row.id as string));
  const responseMatchesVersion = Boolean(checkin?.checkin_template_id && requiredTemplateIds.has(checkin.checkin_template_id as string));
  if ((checkinTemplates ?? []).length > 0 && (!isCheckinHandled(checkin?.response_status as string | null | undefined) || !responseMatchesVersion)) {
    throw codedError('Complete or explicitly skip this day’s check-in before completing the day.', PROGRAM_DAY_REQUIREMENTS_UNMET);
  }

  const { data, error } = await supabaseAdmin
    .from('program_day_completions')
    .upsert({
      enrollment_id: input.enrollmentId,
      program_version_id: summary.version.id,
      program_day: input.day,
    }, { onConflict: 'enrollment_id,program_version_id,program_day', ignoreDuplicates: true })
    .select('id, enrollment_id, program_version_id, program_day, completed_at')
    .maybeSingle();
  if (error) throw new Error(`day completion save failed: ${error.message}`);
  if (data) return data;
  const { data: existing, error: readError } = await supabaseAdmin
    .from('program_day_completions')
    .select('id, enrollment_id, program_version_id, program_day, completed_at')
    .eq('enrollment_id', input.enrollmentId)
    .eq('program_version_id', summary.version.id)
    .eq('program_day', input.day)
    .single();
  if (readError) throw new Error(`day completion retry lookup failed: ${readError.message}`);
  return existing;
}

export async function getProgramDayCompletion(input: {
  personId: string;
  enrollmentId: string;
  day: number;
}) {
  const summary = await assertUnlocked(input.personId, input.enrollmentId, input.day);
  const { data, error } = await supabaseAdmin
    .from('program_day_completions')
    .select('id, enrollment_id, program_version_id, program_day, completed_at')
    .eq('enrollment_id', input.enrollmentId)
    .eq('program_version_id', summary.version.id)
    .eq('program_day', input.day)
    .maybeSingle();
  if (error) throw new Error(`day completion lookup failed: ${error.message}`);
  return data;
}
