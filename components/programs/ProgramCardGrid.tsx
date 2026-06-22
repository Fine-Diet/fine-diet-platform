/**
 * ProgramCardGrid — input-defined grid of program cards for a category page.
 *
 * "Input-defined" means the grid is driven entirely by the program sequence
 * passed in (the offer tree), not hardcoded. CTA behavior is centralized
 * through `resolveProgramMarketingCta` so this component never invents links.
 *
 * No React hooks — safe to render in static/SSR and unit tests.
 */

import Link from 'next/link';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type {
  ProgramSeriesDefinition,
  ProgramSeriesProgramDefinition,
} from '@/lib/programs/programSeriesTypes';
import { theme } from '@/styles/theme';

interface CardTheme {
  bg: string;
  fg: 'light' | 'dark';
}

const CARD_THEMES: CardTheme[] = [
  { bg: theme.colors.brand[900], fg: 'light' },
  { bg: theme.colors.core_data.physiological_feedback, fg: 'light' },
  { bg: theme.colors.core_data.emotional_regulation, fg: 'dark' },
  { bg: theme.colors.core_data.metabolic_rhythm, fg: 'dark' },
  { bg: theme.colors.neutral[700], fg: 'light' },
  { bg: theme.colors.core_data.nutrient_density, fg: 'dark' },
  { bg: theme.colors.accent[700], fg: 'light' },
];

interface ProgramCardProps {
  series: ProgramSeriesDefinition;
  program: ProgramSeriesProgramDefinition;
  index: number;
}

function ProgramCard({ series, program, index }: ProgramCardProps) {
  const cardTheme = CARD_THEMES[index % CARD_THEMES.length];
  const isLight = cardTheme.fg === 'light';
  const cta = resolveProgramMarketingCta({ series, program });
  const detailHref = `/programs/${series.slug}/${program.slug}`;

  const titleColor = isLight ? 'text-white' : 'text-brand-900';
  const bodyColor = isLight ? 'text-white/78' : 'text-brand-900/72';
  const mutedColor = isLight ? 'text-white/60' : 'text-brand-900/55';
  const badgeColor = isLight
    ? 'bg-white/15 text-white'
    : 'bg-brand-900/10 text-brand-900';

  return (
    <article
      className="flex flex-col rounded-3xl p-6 shadow-sm"
      style={{ backgroundColor: cardTheme.bg }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedColor}`}>
          {index === 0 ? 'Start here' : `Step ${index + 1}`}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${badgeColor}`}
        >
          {program.status.replace(/_/g, ' ')}
        </span>
      </div>

      <h3 className={`mt-4 text-2xl font-semibold antialiased ${titleColor}`}>
        <Link href={detailHref} className="underline-offset-4 hover:underline">
          {program.title}
        </Link>
      </h3>
      {program.subtitle && (
        <p className={`mt-1 text-sm font-medium ${mutedColor}`}>
          {program.subtitle}
        </p>
      )}
      <p className={`mt-3 flex-1 text-sm leading-relaxed ${bodyColor}`}>
        {program.description}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={detailHref}
          className={`text-xs font-semibold underline-offset-4 hover:underline ${titleColor}`}
        >
          View program
        </Link>
        {cta.href && !cta.disabled ? (
          <Link
            href={cta.href}
            className={`text-xs font-semibold underline-offset-4 hover:underline ${mutedColor}`}
          >
            {cta.label}
          </Link>
        ) : (
          <span className={`text-xs font-semibold ${mutedColor}`}>
            {cta.label}
          </span>
        )}
      </div>
    </article>
  );
}

export interface ProgramCardGridProps {
  series: ProgramSeriesDefinition;
  /** Optional override of which programs to show. Defaults to the series sequence. */
  programs?: ProgramSeriesProgramDefinition[];
  heading?: string;
  subhead?: string;
}

export default function ProgramCardGrid({
  series,
  programs,
  heading,
  subhead,
}: ProgramCardGridProps) {
  const items = programs ?? series.programs;
  if (items.length === 0) return null;

  return (
    <div>
      {(heading || subhead) && (
        <div className="mb-8">
          {heading && (
            <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
              {heading}
            </h2>
          )}
          {subhead && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-900/58">
              {subhead}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        {items.map((program, index) => (
          <ProgramCard
            key={program.slug}
            series={series}
            program={program}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}
