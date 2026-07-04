/**
 * PreviewBanner
 *
 * Visible "preview chrome" rendered above the assessment runtime when an
 * editor/admin is previewing an unpublished question-set revision. Makes the
 * preview state unmistakable: amber bar, "not published" copy, the revision
 * being previewed, and quick links back to admin and out of preview.
 *
 * This is a diagnostic/authoring surface only — it never appears for public
 * users. The resolver role-gates ?preview=1; this component just reflects the
 * resolved isPreview flag.
 */

import React from 'react';
import Link from 'next/link';

interface PreviewBannerProps {
  /** Registry slug for the assessment (e.g. "gut-check"). */
  slug: string;
  /** Assessment version being previewed. */
  assessmentVersion: number;
  /** Preview revision id, when known from pointer/runner resolution. */
  previewRevisionId?: string;
  /** Manage-page URL in admin for quick round-tripping. */
  manageHref?: string;
}

export function PreviewBanner({
  slug,
  assessmentVersion,
  previewRevisionId,
  manageHref,
}: PreviewBannerProps) {
  const exitHref = `/assessments/${slug}`;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] w-full border-b border-amber-300 bg-amber-100 text-amber-950"
    >
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs sm:text-sm">
        <span className="inline-flex items-center gap-2 font-semibold uppercase tracking-[0.12em]">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-amber-500"
          />
          Preview mode
        </span>
        <span className="text-amber-900/80">
          Unpublished question set · not visible to the public.
        </span>
        <span className="hidden text-amber-900/70 sm:inline">
          {slug} · v{assessmentVersion}
          {previewRevisionId ? ` · rev ${previewRevisionId.slice(0, 8)}` : ''}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {manageHref && (
            <Link
              href={manageHref}
              className="font-semibold text-amber-950 underline-offset-2 hover:underline"
            >
              Open in admin
            </Link>
          )}
          <Link
            href={exitHref}
            className="font-semibold text-amber-950 underline-offset-2 hover:underline"
          >
            Exit preview
          </Link>
        </div>
      </div>
    </div>
  );
}
