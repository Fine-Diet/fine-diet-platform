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
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 disabled:cursor-not-allowed disabled:opacity-70"
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
    <article className="relative isolate min-h-[175px] overflow-hidden rounded-[1.35rem] bg-brand-800 shadow-large sm:min-h-[190px]">
      <Image
        src={program.imageUrl}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 760px"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/58 to-black/22" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />

      <div className="relative z-10 flex min-h-[175px] flex-col justify-end px-5 pb-4 pt-16 sm:min-h-[190px] sm:px-6">
        <div className="max-w-2xl">
          <h3 className="text-2xl font-semibold leading-tight text-white antialiased sm:text-3xl">
            {program.name}
          </h3>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-brand-50/92 px-2 py-0.5 text-[10px] font-semibold text-brand-900">
            <svg
              aria-hidden
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <span>{program.lengthLabel}</span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-snug text-white/86 antialiased">
            {program.objective}
          </p>
        </div>

        <div className="mt-3">
          <button
            type="button"
            disabled={program.cta.disabled}
            aria-label={`${program.cta.label} for ${program.name} is coming soon`}
            className="inline-flex w-full items-center justify-center rounded-full bg-brand-50/90 px-4 py-2.5 text-sm font-semibold text-brand-900 disabled:cursor-not-allowed disabled:opacity-85"
          >
            {program.cta.label === 'Available Soon' && (
              <svg
                aria-hidden
                className="mr-1.5 h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V7.5a4.5 4.5 0 0 0-9 0v3m-.75 0h10.5A1.5 1.5 0 0 1 18.75 12v7.5A1.5 1.5 0 0 1 17.25 21H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z"
                />
              </svg>
            )}
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
    <section className="w-full max-w-[1000px] mx-auto rounded-[1.7rem] bg-[#17100c]/95 px-4 py-5 shadow-large sm:px-8 sm:py-7">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold leading-tight text-white antialiased sm:text-base">
            {category.headline}
          </h2>
          <p className="sr-only">
            {category.description}
          </p>
        </div>
        <CategoryAction category={category} />
      </div>

      <div className={featured ? 'space-y-0' : 'space-y-0'}>
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
        <section className="relative isolate mb-0 min-h-[330px] overflow-hidden bg-brand-900 sm:min-h-[360px]">
          <Image
            src={PROGRAMS_MVP_HERO_IMAGE_URL}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/42" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-brand-900/92" />

          <div className="relative z-10 flex min-h-[330px] w-full max-w-[1000px] flex-col items-center justify-center mx-auto px-5 pt-14 pb-12 text-center sm:min-h-[360px]">
            <h1 className="max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.03em] text-white antialiased sm:text-6xl">
              Made for less dieting, more transformation.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-snug text-white/70 antialiased">
              Fine Diet programs are designed to tailor dietary and lifestyle
              support to you.
            </p>
          </div>
        </section>

        <div className="-mt-6 space-y-8 px-0 sm:px-0">
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
