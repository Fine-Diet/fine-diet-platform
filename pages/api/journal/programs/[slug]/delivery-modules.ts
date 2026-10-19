/**
 * GET /api/journal/programs/[slug]/delivery-modules
 *
 * Person-scoped delivery module definitions for the app renderer. Published
 * admin-authored modules are preferred; Baseline falls back to code config.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { getLibraryDetailForPerson } from '@/lib/programs/programLibraryServerService';
import {
  getDeliveryModulesForProgramWithFallback,
  type DeliveryModulesResult,
} from '@/lib/programs/deliveryModuleDeliveryServerService';
import {
  getLatestPublishedProgramVersionForSlug,
  getProgramRuntimeSummaryForPerson,
  listEnrollmentsForPerson,
} from '@/lib/programs/programRuntimeServerService';
import { authorizePublishedBaselineDelivery } from '@/lib/programs/baselineMemberDeliveryBoundary';
import {
  memberMaximumAccessibleDay,
  rejectDeliveryVersion,
} from '@/lib/programs/historicalReviewPolicy';
import type { ProgramEnrollmentStatus } from '@/lib/programs/runtimeTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeliveryModulesResult | { error: string }>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug is required' });
  }

  const rawVersionId = req.query.version_id;
  const requestedVersionId = Array.isArray(rawVersionId)
    ? rawVersionId[0]
    : rawVersionId;

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveJournalTargetPerson(req, res, ctx);
  if (!personId) return;

  try {
    const detail = await getLibraryDetailForPerson(personId, slug);
    if (!detail) {
      return res.status(404).json({ error: 'Program not found for user' });
    }

    // A client-supplied version is only a consistency hint. The server binds
    // delivery to the signed-in person's enrollment and never selects a
    // different version from request data.
    const enrollments = await listEnrollmentsForPerson(personId);
    const matching = enrollments
      .filter((enrollment) => enrollment.program_slug === slug.toLowerCase())
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const enrollment =
      matching.find((candidate) =>
        ['pre_start', 'active', 'paused'].includes(candidate.status),
      ) ?? matching[0] ?? null;

    let versionId: string;
    let maximumAccessibleDay = 0;
    let authorizedStatus: ProgramEnrollmentStatus = 'pre_start';
    let trustedProgramSlug = detail.slug;
    if (enrollment) {
      const summary = await getProgramRuntimeSummaryForPerson(
        personId,
        enrollment.id,
      );
      if (!summary || summary.enrollment.program_slug !== slug.toLowerCase()) {
        return res.status(403).json({ error: 'Program enrollment unavailable' });
      }
      const versionRejection = rejectDeliveryVersion({
        requestedVersionId,
        enrolledVersionId: summary.version.id,
        versionStatus: summary.version.status,
        responseVersionId: requestedVersionId,
      });
      if (versionRejection === 'foreign-version' || versionRejection === 'stale-response') {
        return res.status(403).json({ error: 'Requested version is not enrolled' });
      }
      if (versionRejection === 'draft-content') {
        return res.status(403).json({ error: 'Enrolled program version unavailable' });
      }
      if (summary.resolved_status === 'cancelled') {
        return res.status(403).json({ error: 'Program access is cancelled' });
      }
      versionId = summary.version.id;
      authorizedStatus = summary.resolved_status;
      trustedProgramSlug = summary.program?.slug || summary.enrollment.program_slug;
      maximumAccessibleDay = memberMaximumAccessibleDay(
        summary.resolved_status,
        summary.current_day,
      );
    } else {
      const version = await getLatestPublishedProgramVersionForSlug(slug);
      if (!version || version.status !== 'published') {
        return res.status(404).json({ error: 'Published program version unavailable' });
      }
      const previewRejection = rejectDeliveryVersion({
        requestedVersionId,
        enrolledVersionId: version.id,
        versionStatus: version.status,
      });
      if (previewRejection === 'foreign-version') {
        return res.status(403).json({ error: 'Requested version is not available' });
      }
      if (previewRejection === 'draft-content') {
        return res.status(404).json({ error: 'Published program version unavailable' });
      }
      versionId = version.id;
      // Entitled or assigned members may see the pre-start overview only.
      maximumAccessibleDay = memberMaximumAccessibleDay('pre_start', 0);
    }

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: slug,
      programVersionId: versionId,
    });
    const decision = authorizePublishedBaselineDelivery({
      programSlug: trustedProgramSlug,
      source: result.source,
      modules: result.modules,
      status: authorizedStatus,
      maximumAccessibleDay,
    });
    if (decision.kind === 'unavailable') {
      return res.status(409).json({
        error: 'Published Baseline delivery is unavailable',
      });
    }
    return res.status(200).json({
      ...result,
      modules: decision.modules,
    });
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'PROGRAM_DEFAULT_VERSION_INVALID') {
      console.error('[journal/programs/[slug]/delivery-modules] error:', err);
      return res.status(409).json({
        error: err instanceof Error ? err.message : 'Configured program version is unavailable',
      });
    }
    console.error('[journal/programs/[slug]/delivery-modules] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
