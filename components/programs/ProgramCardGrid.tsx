/**
 * ProgramCardGrid — input-defined grid of program cards for a category page.
 *
 * "Input-defined" means the grid is driven entirely by the program sequence
 * passed in (the offer tree), not hardcoded. CTA behavior is centralized
 * through `resolveProgramMarketingCta` so this component never invents links.
 *
 * Visual: image-backed cards with colored copy panels, overlaid sequence
 * markers, and disclosure-driven expanded detail copy.
 */

import Image from 'next/image';
import Link from 'next/link';
import type {
  ProgramSeriesDefinition,
  ProgramSeriesProgramDefinition,
} from '@/lib/programs/programSeriesTypes';
import { theme } from '@/styles/theme';

interface CardTheme {
  bg: string;
}

// Body-panel colors mapped to existing brand + core_data tokens (no one-off hex).
const CARD_THEMES: CardTheme[] = [
  { bg: theme.colors.brand[900] },
  { bg: theme.colors.neutral[900] },
  { bg: theme.colors.core_data.metabolic_rhythm },
  { bg: theme.colors.core_data.physiological_feedback },
  { bg: theme.colors.neutral[700] },
  { bg: theme.colors.accent[700] },
  { bg: theme.colors.neutral[500] },
];

interface ProgramCardProps {
  series: ProgramSeriesDefinition;
  program: ProgramSeriesProgramDefinition;
  index: number;
}

function formatList(items?: string[]) {
  if (!items || items.length === 0) return null;
  return items.join(' ');
}

function ProgramCard({ series, program, index }: ProgramCardProps) {
  const cardTheme = CARD_THEMES[index % CARD_THEMES.length];
  const detailHref = `/programs/${series.slug}/${program.slug}`;
  const imageSrc = program.imageUrl ?? series.heroImageUrl;
  const expandedDetails = [
    {
      title: 'Best for:',
      body: formatList(program.whoFor),
    },
    {
      title: 'Inside this program:',
      body: formatList(program.whatYouWillDo),
    },
    {
      title: "You'll walk away with:",
      body: program.objective,
    },
  ].filter((item) => Boolean(item.body));

  return (
    <article
      className="overflow-hidden rounded-3xl text-white shadow-sm"
      style={{ backgroundColor: cardTheme.bg }}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <Image
          src={imageSrc}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 50vw"
        />
        <span
          className="absolute bottom-5 left-5 flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: cardTheme.bg }}
        >
          {index + 1}
        </span>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none px-6 py-6 marker:hidden">
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold leading-none tracking-[-0.03em] antialiased sm:text-3xl">
              <Link href={detailHref} className="underline-offset-4 hover:underline">
                {program.title}
              </Link>
            </h3>
            {program.lengthLabel && (
              <p className="mt-1 text-base font-semibold leading-snug text-white">
                {program.lengthLabel} Program
              </p>
            )}
            <p className="mt-3 text-base font-light leading-relaxed text-white">
              {program.description}
            </p>
          </div>
          <span className="mt-5 flex w-full justify-end">
            <span
              className="text-5xl leading-[0.45] text-white transition-transform duration-300 group-open:rotate-180"
              aria-hidden="true"
            >
              ▾
            </span>
          </span>
        </summary>

        {expandedDetails.length > 0 && (
          <div className="overflow-hidden border-t border-white/15 px-6 pb-7 pt-5 transition-all duration-300 ease-out">
            <div className="space-y-4 text-base leading-relaxed text-white">
              {expandedDetails.map((item) => (
                <div key={item.title}>
                  <p className="font-semibold">{item.title}</p>
                  <p className="font-light">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </details>
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
        <div className="mb-8 text-left">
          {heading && (
            <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
              {heading}
            </h2>
          )}
          {subhead && (
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-brand-900/58">
              {subhead}
            </p>
          )}
        </div>
      )}
      <div className="grid items-start gap-6 sm:grid-cols-2">
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
