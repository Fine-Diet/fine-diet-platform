'use client';

import Image from 'next/image';
import Link from 'next/link';

import type { AppHomeFoodViewModel, AppHomeProgramsViewModel } from '@/lib/app/home/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

const CTA =
  'mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#BCCCDC] text-sm font-semibold text-[#1A1612] transition hover:bg-[#c5d0da]';

export function ProgramsContinuationCard({
  programs,
}: {
  programs: AppHomeProgramsViewModel;
}) {
  const slide = programs.primarySlide;
  const href =
    slide?.cta.href && !slide.cta.disabled
      ? slide.cta.href
      : APP_ROUTES.programs;
  const label = slide?.cta.label ?? 'Open Programs';
  const title =
    slide?.title ??
    (programs.status === 'loading'
      ? 'Loading your program…'
      : 'Continue in Programs');
  const description =
    slide?.description ??
    (programs.errorMessage ??
      'Open Programs to review access, enrollment, and next steps.');

  return (
    <article className="relative mt-8 overflow-hidden rounded-[28px] md:mt-10">
      <div className="relative min-h-[280px] w-full md:min-h-[220px]">
        <Image
          src={
            slide?.imageUrl ??
            'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg'
          }
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 1000px) 100vw, 1000px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
        <div className="relative z-10 flex h-full min-h-[280px] flex-col justify-end px-5 py-6 md:min-h-[220px] md:px-7 md:py-7">
          <p className="text-sm font-medium text-white/85">Programs</p>
          <h3 className="mt-2 max-w-[28ch] text-2xl font-semibold leading-tight text-white md:text-[1.85rem]">
            {programs.status === 'loading' ? (
              <span className="inline-block h-8 w-2/3 animate-pulse rounded bg-white/15" />
            ) : (
              title
            )}
          </h3>
          <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-white/75">
            {description}
          </p>
          {slide?.cta.disabled ? (
            <button type="button" disabled className={cn(CTA, 'cursor-not-allowed opacity-80')}>
              {label}
            </button>
          ) : (
            <Link href={href} className={CTA}>
              {label}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function FoodReadinessCard({ food }: { food: AppHomeFoodViewModel }) {
  return (
    <article className="relative mt-5 overflow-hidden rounded-[28px] md:mt-6">
      <div className="relative min-h-[280px] w-full md:min-h-[220px]">
        <Image
          src={food.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 1000px) 100vw, 1000px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
        <div className="relative z-10 flex h-full min-h-[280px] flex-col justify-end px-5 py-6 md:min-h-[220px] md:px-7 md:py-7">
          <p className="text-sm font-medium text-white/85">{food.eyebrow}</p>
          <h3 className="mt-2 max-w-[32ch] text-2xl font-semibold leading-tight text-white md:text-[1.85rem]">
            {food.status === 'loading' ? (
              <span className="inline-block h-8 w-3/4 animate-pulse rounded bg-white/15" />
            ) : (
              food.title
            )}
          </h3>
          <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-white/75">
            {food.description}
          </p>
          <Link href={food.ctaHref} className={CTA}>
            {food.ctaLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}
