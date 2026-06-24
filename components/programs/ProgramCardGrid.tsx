/**
 * ProgramCardGrid — input-defined grid of program cards for a category page.
 *
 * "Input-defined" means the grid is driven entirely by the program sequence
 * passed in (the offer tree), not hardcoded. CTA behavior is centralized
 * through `resolveProgramMarketingCta` so this component never invents links.
 *
 * Visual: image-backed cards with colored body panels (mapped to design
 * tokens), a number marker, duration, description, and a status/CTA row.
 * Baseline (index 0) is featured — a wider, image-beside-copy card.
 *
 * No React hooks — safe to render in static/SSR and unit tests.
 */

import Image from 'next/image';
import Link from 'next/link';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type {
  ProgramMarketingCtaResolution,
  ProgramSeriesDefinition,
  ProgramSeriesProgramDefinition,
} from '@/lib/programs/programSeriesTypes';
import { theme } from '@/styles/theme';

interface CardTheme {
  bg: string;
  fg: 'light' | 'dark';
}

// Body-panel colors mapped to existing brand + core_data tokens (no one-off hex).
const CARD_THEMES: CardTheme[] = [
  { bg: theme.colors.brand[900], fg: 'light' },
  { bg: theme.colors.core_data.physiological_feedback, fg: 'light' },
  { bg: theme.colors.core_data.emotional_regulation, fg: 'dark' },
  { bg: theme.colors.core_data.metabolic_rhythm, fg: 'dark' },
  { bg: theme.colors.neutral[700], fg: 'light' },
  { bg: theme.colors.core_data.nutrient_density, fg: 'dark' },
  { bg: theme.colors.accent[700], fg: 'light' },
];

function toneClasses(isLight: boolean) {
  return {
    title: isLight ? 'text-white' : 'text-brand-900',
    body: isLight ? 'text-white/78' : 'text-brand-900/72',
    muted: isLight ? 'text-white/60' : 'text-brand-900/55',
    marker: isLight
      ? 'bg-white/15 text-white'
      : 'bg-brand-900/10 text-brand-900',
    badge: isLight
      ? 'bg-white/15 text-white'
      : 'bg-brand-900/10 text-brand-900',
    ctaSolid: isLight
      ? 'bg-white text-brand-900 hover:bg-brand-50'
      : 'bg-brand-900 text-white hover:bg-brand-800',
  };
}

function ProgramCardCta({
  cta,
  isLight,
}: {
  cta: ProgramMarketingCtaResolution;
  isLight: boolean;
}) {
  const tone = toneClasses(isLight);
  if (cta.href && !cta.disabled) {
    return (
      <Link
        href={cta.href}
        className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold transition ${tone.ctaSolid}`}
      >
        {cta.label}
      </Link>
    );
  }
  return (
    <span className={`text-xs font-semibold ${tone.muted}`}>{cta.label}</span>
  );
}

interface ProgramCardProps {
  series: ProgramSeriesDefinition;
  program: ProgramSeriesProgramDefinition;
  index: number;
  featured?: boolean;
}

function ProgramCard({ series, program, index, featured = false }: ProgramCardProps) {
  const cardTheme = CARD_THEMES[index % CARD_THEMES.length];
  const isLight = cardTheme.fg === 'light';
  const tone = toneClasses(isLight);
  const cta = resolveProgramMarketingCta({ series, program });
  const detailHref = `/programs/${series.slug}/${program.slug}`;
  const imageSrc = program.imageUrl ?? series.heroImageUrl;
  const stepLabel = index === 0 ? 'Start here' : `Step ${index + 1}`;

  const header = (
    <div className="flex items-center justify-between gap-3">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${tone.marker}`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${tone.badge}`}
      >
        {program.status.replace(/_/g, ' ')}
      </span>
    </div>
  );

  const copy = (
    <>
      <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.2em] ${tone.muted}`}>
        {stepLabel}
        {program.lengthLabel ? ` · ${program.lengthLabel}` : ''}
      </p>
      <h3 className={`mt-1 text-2xl font-semibold antialiased ${tone.title}`}>
        <Link href={detailHref} className="underline-offset-4 hover:underline">
          {program.title}
        </Link>
      </h3>
      {program.subtitle && (
        <p className={`mt-1 text-sm font-medium ${tone.muted}`}>{program.subtitle}</p>
      )}
      <p className={`mt-3 flex-1 text-sm leading-relaxed ${tone.body}`}>
        {program.description}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ProgramCardCta cta={cta} isLight={isLight} />
        <Link
          href={detailHref}
          className={`text-xs font-semibold underline-offset-4 hover:underline ${tone.muted}`}
        >
          View program
        </Link>
      </div>
    </>
  );

  if (featured) {
    return (
      <article
        className="overflow-hidden rounded-3xl shadow-sm sm:col-span-2 sm:grid sm:grid-cols-2"
        style={{ backgroundColor: cardTheme.bg }}
      >
        <div className="relative aspect-[16/10] w-full sm:aspect-auto sm:min-h-[280px]">
          <Image
            src={imageSrc}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        </div>
        <div className="flex flex-col p-7 sm:p-8">
          {header}
          {copy}
        </div>
      </article>
    );
  }

  return (
    <article
      className="flex flex-col overflow-hidden rounded-3xl shadow-sm"
      style={{ backgroundColor: cardTheme.bg }}
    >
      <div className="relative aspect-[16/10] w-full">
        <Image
          src={imageSrc}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 50vw"
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        {header}
        {copy}
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
            featured={index === 0}
          />
        ))}
      </div>
    </div>
  );
}
