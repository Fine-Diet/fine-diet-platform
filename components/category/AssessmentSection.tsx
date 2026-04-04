/**
 * Category page — Assessment CTA section
 *
 * Renders a full-width band that invites the visitor to take an assessment.
 * Links to /lp/{assessmentSlug} (landing page) or a custom ctaHref.
 */

import Link from 'next/link';
import type { NavigationAssessmentSection } from '@/lib/contentTypes';

interface AssessmentSectionProps {
  section: NavigationAssessmentSection;
}

export function AssessmentSection({ section }: AssessmentSectionProps) {
  if (!section.enabled) return null;

  const ctaHref = section.ctaHref ?? `/lp/${section.assessmentSlug}`;

  return (
    <section
      className="relative isolate overflow-hidden"
      style={
        section.backgroundImage
          ? {
              backgroundImage: `url(${section.backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }
      }
      aria-label={section.headline}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/50 to-transparent" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 sm:py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold leading-tight text-white mb-4">
          {section.headline}
        </h2>

        {section.body && (
          <p className="text-base sm:text-lg font-light text-white/80 mb-8 max-w-xl mx-auto">
            {section.body}
          </p>
        )}

        <Link
          href={ctaHref}
          className="inline-block rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-gray-900 shadow-md hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {section.ctaLabel}
        </Link>
      </div>
    </section>
  );
}
