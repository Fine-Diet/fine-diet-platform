/**
 * AssessmentCoverHero
 *
 * Generic, full-viewport cover/landing hero for assessment routes. Renders a
 * background image (with optional mobile override), a legibility overlay, the
 * Fine Diet wordmark, headline + subheadline, a primary CTA that starts (or
 * resumes) the assessment, and a login prompt/link.
 *
 * This component is assessment-agnostic — it renders exactly what the
 * AssessmentCoverConfig gives it. No Gut Check-specific copy or scoring
 * semantics live here. The same template serves every registered assessment
 * until a future packet introduces per-assessment cover templates.
 *
 * Per the stacked-page-sections rule, the hero is layer 0: a flat-bottom
 * full-bleed surface with no rounded corners and no negative top margin.
 */

import React from 'react';
import Link from 'next/link';
import type { AssessmentCoverConfig } from '@/lib/assessments/coverConfig';

interface AssessmentCoverHeroProps {
  cover: AssessmentCoverConfig;
  /** href that starts/resumes the assessment (e.g. /assessments/<slug>/start). */
  startHref: string;
}

export function AssessmentCoverHero({ cover, startHref }: AssessmentCoverHeroProps) {
  const desktopFocal = cover.desktopFocalPoint
    ? `${cover.desktopFocalPoint.x}% ${cover.desktopFocalPoint.y}%`
    : '50% 40%';
  const mobileFocal = cover.mobileFocalPoint
    ? `${cover.mobileFocalPoint.x}% ${cover.mobileFocalPoint.y}%`
    : '50% 30%';

  const hasImage = Boolean(cover.heroImageUrl);
  const opacityPct = Math.max(0, Math.min(1, cover.overlayOpacity)) * 100;

  return (
    <section
      className="relative min-h-[100svh] w-full overflow-hidden bg-brand-900 text-white"
      aria-labelledby="assessment-cover-headline"
    >
      {/* Background image layer */}
      {hasImage && (
        <>
          <div
            className="absolute inset-0 hidden bg-cover bg-no-repeat md:block"
            style={{
              backgroundImage: cover.heroImageUrl
                ? `url(${cover.heroImageUrl})`
                : undefined,
              backgroundPosition: desktopFocal,
            }}
            role="img"
            aria-label={cover.imageAlt ?? 'Assessment cover background'}
          />
          {cover.mobileHeroImageUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-no-repeat md:hidden"
              style={{
                backgroundImage: `url(${cover.mobileHeroImageUrl})`,
                backgroundPosition: mobileFocal,
              }}
              role="img"
              aria-label={cover.imageAlt ?? 'Assessment cover background'}
            />
          ) : null}
        </>
      )}

      {/* Legibility overlay */}
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: hasImage ? `${opacityPct}%` : 0.92 }}
        aria-hidden="true"
      />

      {/* Foreground */}
      <div className="relative z-10 flex min-h-[100svh] flex-col">
        {/* Wordmark */}
        <header className="px-6 pt-6 sm:px-10 sm:pt-10">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-semibold uppercase tracking-[0.18em] text-white/90 transition-opacity hover:opacity-80 antialiased"
          >
            {cover.logoText}
          </Link>
        </header>

        {/* Headline + CTA */}
        <div className="flex flex-1 flex-col justify-center px-6 pb-16 sm:px-10">
          <div className="mx-auto w-full max-w-[680px]">
            <h1
              id="assessment-cover-headline"
              className="text-4xl font-semibold leading-tight text-white sm:text-5xl md:text-6xl antialiased"
            >
              {cover.headline}
            </h1>
            {cover.subheadline && (
              <p className="mt-6 max-w-[520px] text-base text-white/80 sm:text-lg antialiased">
                {cover.subheadline}
              </p>
            )}

            <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Link
                href={startHref}
                className="inline-flex items-center justify-center rounded-full bg-denim-500 px-8 py-4 text-base font-bold text-neutral-900 transition-colors hover:bg-denim-300 antialiased"
              >
                {cover.ctaLabel}
              </Link>

              <div className="flex items-center gap-2 text-sm text-white/80 antialiased">
                <span>{cover.loginPrompt}</span>
                <Link
                  href={cover.loginHref}
                  className="font-semibold text-white underline-offset-4 transition-opacity hover:opacity-80 hover:underline"
                >
                  {cover.loginLabel}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
