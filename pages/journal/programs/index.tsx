'use client';

import Image from 'next/image';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  PROGRAMS_MVP_CATEGORIES,
  PROGRAMS_MVP_HERO_IMAGE_URL,
  type AppProgramDefinition,
  type AppProgramSupportCategoryDefinition,
} from '@/lib/programs/appProgramsMvp';

function CategoryAction({
  category,
}: {
  category: AppProgramSupportCategoryDefinition;
}) {
  return (
    <button
      type="button"
      disabled={category.categoryNavigationDisabled}
      aria-label={`${category.name} category navigation coming soon`}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/45 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg
        aria-hidden
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function ProgramCard({ program }: { program: AppProgramDefinition }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-large">
      <div className="relative h-40 overflow-hidden bg-brand-800">
        <Image
          src={program.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 320px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-900/85 via-brand-900/25 to-transparent" />
        <div className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-md">
          {program.lengthLabel}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div>
          <h3 className="text-xl font-semibold leading-tight text-white antialiased">
            {program.name}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-white/62 antialiased">
            {program.objective}
          </p>
        </div>

        <div className="mt-5 flex flex-1 items-end">
          <button
            type="button"
            disabled={program.cta.disabled}
            aria-label={`${program.cta.label} for ${program.name} is coming soon`}
            className="inline-flex w-full items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/62 transition-colors disabled:cursor-not-allowed disabled:opacity-70"
          >
            {program.cta.label}
          </button>
        </div>
      </div>
    </article>
  );
}

function CategorySection({
  category,
  featured = false,
}: {
  category: AppProgramSupportCategoryDefinition;
  featured?: boolean;
}) {
  const programs = category.series.flatMap((series) => series.programs);

  return (
    <section className="w-full max-w-[1000px] mx-auto">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-50/45 antialiased">
            {category.name}
          </p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight text-white antialiased sm:text-3xl">
            {category.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/58 antialiased">
            {category.description}
          </p>
        </div>
        <CategoryAction category={category} />
      </div>

      <div
        className={
          featured
            ? 'grid grid-cols-1 gap-3 md:grid-cols-3'
            : 'grid grid-cols-1 gap-3 md:grid-cols-2'
        }
      >
        {programs.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </div>
    </section>
  );
}

export default function JournalProgramsLibraryPage() {
  const nutritionCategory = PROGRAMS_MVP_CATEGORIES.find(
    (category) => category.key === 'nutrition',
  );
  const remainingCategories = PROGRAMS_MVP_CATEGORIES.filter(
    (category) => category.key !== 'nutrition',
  );

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <section className="relative isolate mb-7 overflow-hidden rounded-b-md bg-brand-900">
          <Image
            src={PROGRAMS_MVP_HERO_IMAGE_URL}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-brand-900/72 to-brand-900" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-900/85 via-brand-900/45 to-transparent" />

          <div className="relative z-10 w-full max-w-[1000px] mx-auto px-5 pt-14 pb-14 sm:pb-18">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-50/50 antialiased">
              Programs
            </p>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight text-white antialiased sm:text-5xl">
              Guided support for your next nutrition step.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/72 antialiased sm:text-base">
              Explore the pathways Fine Diet is preparing for your food,
              rhythm, and deeper support needs. This first pass is static while
              program enrollment, progress, and dependency logic are built.
            </p>
          </div>
        </section>

        <div className="space-y-9 px-5">
          {nutritionCategory && (
            <CategorySection category={nutritionCategory} featured />
          )}

          {remainingCategories.map((category) => (
            <CategorySection key={category.key} category={category} />
          ))}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
