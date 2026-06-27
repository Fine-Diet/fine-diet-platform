/**
 * API: /api/admin/programs-marketing/[slug]/publish-composition
 *
 * POST — promote the draft composition to published status.
 *        Copies the draft row content into the published row (upsert).
 *        Revalidates the public page.
 *
 * Admin-only. Product record status is independent — this only affects the
 * composition. The page renders the composition-driven template only when the
 * product record is ALSO published (publish gate). Service-role writes via the
 * programsMarketingApi adapter.
 *
 * Validation gate: refuses to publish while the draft contains invalid modules.
 * Without this, invalid modules would be silently dropped by the strict render
 * loader, publishing a partial page. Reuses the existing endpoint — no new route.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getProgramsMarketingComposition,
  getProgramsMarketingCompositionForEditing,
  upsertProgramsMarketingComposition,
  programMarketingPublicPath,
} from '@/lib/programs/programsMarketingApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slug = req.query.slug as string;

  // Non-destructive inspection: gate publish if any stored module is invalid,
  // so we never publish a silently-stripped page.
  const inspected = await getProgramsMarketingCompositionForEditing(slug, 'draft');
  if (!inspected) {
    return res.status(404).json({
      success: false,
      error: 'No draft composition found. Save a draft first.',
    });
  }

  if (inspected.invalidCount > 0) {
    const invalid = inspected.validity.filter((v) => !v.valid);
    return res.status(422).json({
      success: false,
      error: `Cannot publish: ${inspected.invalidCount} module${
        inspected.invalidCount === 1 ? '' : 's'
      } have invalid content. Fix them in the editor before publishing.`,
      invalidModules: invalid.map((v) => ({
        id: v.id,
        type: v.type,
        unknownType: v.unknownType,
        issues: v.issues,
      })),
    });
  }

  // All modules valid — the strict draft now equals the full stored draft.
  const draft = await getProgramsMarketingComposition(slug, 'draft');
  if (!draft) {
    return res.status(404).json({
      success: false,
      error: 'No draft composition found. Save a draft first.',
    });
  }

  const { success, error } = await upsertProgramsMarketingComposition(slug, draft, 'published');
  if (!success) return res.status(500).json({ success: false, error });

  try {
    await res.revalidate(programMarketingPublicPath(slug));
  } catch {
    // Not fatal — content is saved.
  }

  return res.status(200).json({ success: true });
}
