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
import type { ProgramSeriesDefinition } from '@/lib/programs/programSeriesTypes';
import { theme } from '@/styles/theme';

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
}

export default function ProgramSequenceMatrix({
  series,
  heading,
  subhead,
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
          <p className="mt-2 text-sm leading-relaxed text-brand-900/58">
            {subhead}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-100 bg-neutral-0 shadow-sm">
        {/* Column headers */}
        <div className="grid grid-cols-[1.6fr_0.8fr_2fr] gap-4 bg-brand-900 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 sm:px-7">
          <span>Program</span>
          <span>Duration</span>
          <span>Outcome</span>
        </div>

        <div className="divide-y divide-brand-100">
          {programs.map((program, index) => {
            const accent = ROW_ACCENTS[index % ROW_ACCENTS.length];
            const detailHref = `/programs/${series.slug}/${program.slug}`;
            return (
              <div
                key={program.slug}
                className="grid grid-cols-[1.6fr_0.8fr_2fr] items-center gap-4 px-5 py-4 transition-colors hover:bg-brand-50 sm:px-7"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-8 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  <div className="min-w-0">
                    <Link
                      href={detailHref}
                      className="text-sm font-semibold text-brand-900 underline-offset-4 hover:underline sm:text-base"
                    >
                      {program.title}
                    </Link>
                    {index === 0 && (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-900/40">
                        Start here
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-brand-900/60 sm:text-sm">
                  {program.lengthLabel || 'Self-paced'}
                </span>
                <span className="text-xs leading-relaxed text-brand-900/70 sm:text-sm">
                  {program.subtitle || program.objective}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
