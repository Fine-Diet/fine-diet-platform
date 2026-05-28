/**
 * POST /api/admin/programs/grant-access
 *
 * Admin-only helper for granting published guided-program access without
 * relying on public product or checkout pages.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireRoleFromApi } from '@/lib/authServer';
import { handleAdminEntitlementGrant as ensureProgramAssignmentFromAdminEntitlement } from '@/lib/plans/programAssignmentAutomationServerService';
import {
  createProgramEnrollmentFromAccess,
  getProgramRuntimeSummaryForPerson,
} from '@/lib/programs/programRuntimeServerService';
import type {
  ProgramCapacity,
  ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

const GrantProgramAccessSchema = z
  .object({
    person_id: z.string().uuid(),
    program_slug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    starts_at: z.string().datetime().optional().nullable(),
    ends_at: z.string().datetime().optional().nullable(),
    source_ref: z.string().trim().max(200).optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable(),
    create_enrollment_now: z.boolean().optional(),
    selected_start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    timezone: z.string().trim().min(1).max(128).optional().nullable(),
    current_capacity: z.enum(['low', 'steady', 'high']).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      value.starts_at &&
      value.ends_at &&
      new Date(value.ends_at).getTime() <= new Date(value.starts_at).getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ends_at'],
        message: 'ends_at must be after starts_at.',
      });
    }
    if (value.create_enrollment_now && !value.selected_start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selected_start_date'],
        message: 'selected_start_date is required when creating enrollment now.',
      });
    }
  });

interface GrantProgramAccessResponse {
  entitlement: Record<string, unknown> | null;
  entitlement_action: 'created' | 'unchanged';
  program: {
    id: string;
    slug: string;
    title: string;
    status: string;
  };
  assignment_action: string | null;
  assignment_reason: string | null;
  enrollment_summary: ProgramRuntimeSummary | null;
}

interface GrantableProgramRow {
  id: string;
  slug: string;
  title: string;
  status: string;
}

async function findActiveEntitlement(
  personId: string,
  entitlementKey: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('person_entitlements')
    .select('*')
    .eq('person_id', personId)
    .eq('entitlement_key', entitlementKey)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`active entitlement lookup failed: ${error.message}`);
  }

  const now = Date.now();
  return (
    ((data ?? []) as Record<string, unknown>[]).find((row) => {
      const endsAt = typeof row.ends_at === 'string' ? row.ends_at : null;
      return !endsAt || new Date(endsAt).getTime() > now;
    }) ?? null
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GrantProgramAccessResponse | { error: string; issues?: unknown }
  >,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  const parsed = GrantProgramAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid program access grant payload.',
      issues: parsed.error.flatten(),
    });
  }

  const programSlug = parsed.data.program_slug.trim().toLowerCase();

  try {
    const [{ data: person, error: personError }, { data: program, error: programError }] =
      await Promise.all([
        supabaseAdmin
          .from('people')
          .select('id')
          .eq('id', parsed.data.person_id)
          .maybeSingle(),
        supabaseAdmin
          .from('programs')
          .select('id, slug, title, status')
          .eq('slug', programSlug)
          .maybeSingle(),
      ]);
    if (personError) {
      throw new Error(`person lookup failed: ${personError.message}`);
    }
    if (programError) {
      throw new Error(`program lookup failed: ${programError.message}`);
    }
    if (!person) {
      return res.status(404).json({ error: 'Person not found.' });
    }
    if (!program) {
      return res.status(404).json({ error: 'Program not found.' });
    }
    if (program.status !== 'published') {
      return res.status(400).json({
        error: 'Only published programs can be granted through Program Access.',
      });
    }

    const grantableProgram = program as GrantableProgramRow;
    const entitlementKey = `program:${grantableProgram.slug}`;

    let entitlement = await findActiveEntitlement(
      parsed.data.person_id,
      entitlementKey,
    );
    let entitlementAction: GrantProgramAccessResponse['entitlement_action'] =
      'unchanged';

    if (!entitlement) {
      const nowIso = new Date().toISOString();
      const row: Record<string, unknown> = {
        person_id: parsed.data.person_id,
        entitlement_key: entitlementKey,
        is_active: true,
        starts_at: parsed.data.starts_at ?? nowIso,
        source: 'admin_grant',
        source_ref:
          parsed.data.source_ref?.trim() || `admin:program-access:${programSlug}`,
        note:
          parsed.data.note?.trim() ||
          `Admin-granted ${entitlementKey} access for runtime testing/support.`,
        created_by: user.id,
        updated_by: user.id,
      };
      if (parsed.data.ends_at) row.ends_at = parsed.data.ends_at;

      const { data, error } = await supabaseAdmin
        .from('person_entitlements')
        .insert(row)
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          entitlement = await findActiveEntitlement(
            parsed.data.person_id,
            entitlementKey,
          );
        } else {
          throw new Error(`program entitlement grant failed: ${error.message}`);
        }
      } else {
        entitlement = data as Record<string, unknown>;
        entitlementAction = 'created';
      }
    }

    let assignmentAction: string | null = null;
    let assignmentReason: string | null = null;
    const assignment = await ensureProgramAssignmentFromAdminEntitlement({
      personId: parsed.data.person_id,
      entitlementKey,
      sourceRef:
        parsed.data.source_ref?.trim() || `admin:program-access:${programSlug}`,
      source: 'admin_grant',
      createdByUserId: user.id,
    });
    assignmentAction = assignment.action;
    assignmentReason = assignment.reason;

    let enrollmentSummary: ProgramRuntimeSummary | null = null;
    if (parsed.data.create_enrollment_now) {
      const enrollment = await createProgramEnrollmentFromAccess({
        personId: parsed.data.person_id,
        programSlug,
        selectedStartDate: parsed.data.selected_start_date!,
        timezone: parsed.data.timezone ?? 'UTC',
        currentCapacity:
          (parsed.data.current_capacity as ProgramCapacity | null | undefined) ??
          undefined,
      });
      enrollmentSummary = await getProgramRuntimeSummaryForPerson(
        parsed.data.person_id,
        enrollment.id,
      );
    }

    return res.status(entitlementAction === 'created' ? 201 : 200).json({
      entitlement,
      entitlement_action: entitlementAction,
      program: grantableProgram,
      assignment_action: assignmentAction,
      assignment_reason: assignmentReason,
      enrollment_summary: enrollmentSummary,
    });
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const status =
      code === 'PROGRAM_ACCESS_DENIED' ||
      code === 'PROGRAM_ENTITLEMENT_DENIED' ||
      code === 'PROGRAM_ASSIGNMENT_DENIED'
        ? 403
        : /No matching published runtime version|not found/i.test(
              err instanceof Error ? err.message : '',
            )
          ? 404
          : 500;
    console.error('[admin/programs/grant-access] error:', err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
