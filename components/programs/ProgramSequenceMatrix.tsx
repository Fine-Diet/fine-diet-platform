/**
 * ProgramSequenceMatrix — a light, rounded matrix table for a program series:
 * Program / Duration / Outcome.
 *
 * Input-defined: rows come straight from the series' program sequence (offer
 * tree), Baseline first. Each program title links to its public detail page.
 * Colored row accents map to existing core_data design tokens (no one-off hex).
 *
 * No React hooks — safe for SSR and direct unit-test invocation.
 */

import Link from 'next/link';
import type {
  ProgramMarketingCtaResolution,
  ProgramSeriesDefinition,
} from '@/lib/programs/programSeriesTypes';
import { theme } from '@/styles/theme';
import { PrimaryPillCta } from './PrimaryPillCta';

// Row accent colors, mapped to existing tokens (brand + core_data) so the
// matrix stays on-palette rather than introducing scattered hex values.
const ROW_ACCENTS: string[] = [
  theme.colors.brand[900],
  theme.colors.core_data.physiological_feedback,
  theme.colors.core_data.emotional_regulation,
  theme.colors.core_data.metabolic_rhythm,
  theme.colors.core_data.nutrient_density,
  theme.colors.accent[700],
  theme.colors.neutral[700],
];

export interface ProgramSequenceMatrixProps {
  series: ProgramSeriesDefinition;
  heading: string;
  subhead?: string;
  /** Featured-product CTA rendered full-width beneath the table. */
  cta?: ProgramMarketingCtaResolution;
}

export default function ProgramSequenceMatrix({
  series,
  heading,
  subhead,
  cta,
}: ProgramSequenceMatrixProps) {
  const programs = series.programs;
  if (programs.length === 0) return null;

  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
          {heading}
        </h2>
        {subhead && (
          <p className="mt-2 text-base leading-relaxed text-brand-900/58">
            {subhead}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-100 bg-neutral-0 shadow-sm">
        {/* Column headers */}
        <div className="grid grid-cols-[1.6fr_0.8fr_2fr] gap-0 px-5 text-base font-semibold normal-case tracking-normal text-brand-900 sm:px-7">
          <span className="flex items-center py-3.5">Program</span>
          <span className="flex items-center border-l border-brand-900/50 py-3.5 pl-4">
            Duration
          </span>
          <span className="flex items-center border-l border-brand-900/50 py-3.5 pl-4">
            Outcome
          </span>
        </div>

        <div>
          {programs.map((program, index) => {
            const accent = ROW_ACCENTS[index % ROW_ACCENTS.length];
            const detailHref = `/programs/${series.slug}/${program.slug}`;
            return (
              <div
                key={program.slug}
                className="grid grid-cols-[1.6fr_0.8fr_2fr] gap-0 px-5 text-white transition-all hover:brightness-105 sm:px-7"
                style={{ backgroundColor: accent }}
              >
                <div className="flex min-w-0 flex-col justify-center py-5">
                  <Link
                    href={detailHref}
                    className="text-sm font-semibold text-white underline-offset-4 hover:underline sm:text-base"
                  >
                    {program.title}
                  </Link>
                  
                </div>
                <span className="flex font-semibold items-center border-l border-brand-900/50 py-4 pl-4 text-xs text-white/80 sm:text-sm">
                  {program.lengthLabel || 'Self-paced'}
                </span>
                <span className="flex items-center border-l border-brand-900/50 py-4 pl-4 text-xs leading-relaxed text-white/85 sm:text-sm">
                  {program.subtitle || program.objective}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {cta && <PrimaryPillCta cta={cta} wide tone="brand" className="mt-6 max-w-none" />}
    </div>
  );
}
