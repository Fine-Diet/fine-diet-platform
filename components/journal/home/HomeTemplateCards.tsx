/**
 * HomeTemplateCards — /journal/home pair of program/insight template cards.
 *
 * Extracted verbatim from pages/journal/home.tsx (Packet 2B-B). Self-contained
 * and presentational: two light cards (default program path + "why it matters"
 * insight) that link to program/log routes. No props, no data, no auth.
 */

import Link from 'next/link';
import Image from 'next/image';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const BASELINE_CARD_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';
const CASE_STUDY_CARD_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776802981375-Case-Study-Dondrea-1x1.jpg';

export function HomeTemplateCards() {
  const cards = [
    {
      eyebrow: 'Your Default Path',
      headline: 'Build Your Foundation',
      progress: 'Step 2 of 6 • 33%',
      body: 'Create daily consistency with meals, habits and awareness.',
      href: APP_ROUTES.programs,
      image: BASELINE_CARD_IMAGE,
      showChevron: true,
      imageOnRightMobile: false,
    },
    {
      eyebrow: 'Why it matters today',
      headline: 'Protein at breakfast supports steady energy and focus',
      progress: null,
      body: 'See why →',
      href: APP_ROUTES.log,
      image: CASE_STUDY_CARD_IMAGE,
      showChevron: false,
      imageOnRightMobile: true,
    },
  ];

  return (
    <section className="grid w-full max-w-[1000px] mx-auto grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.headline}
          href={card.href}
          className={`flex items-center gap-3 rounded-2xl bg-brand-50 p-3 text-black shadow-large transition-transform hover:scale-[1.01] sm:flex-col sm:items-stretch sm:gap-0 ${
            card.imageOnRightMobile ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:h-auto sm:w-full sm:aspect-[5/2]">
            <Image
              src={card.image}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 112px, 325px"
            />
          </div>
          <div className="flex flex-1 items-center justify-between gap-2 px-1 sm:mt-3 sm:px-2 sm:pb-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-black/40">{card.eyebrow}</p>
              <h3 className="mt-1 text-base font-semibold leading-tight text-black antialiased">{card.headline}</h3>
              {card.progress && (
                <p className="mt-1 text-sm font-medium text-black antialiased">{card.progress}</p>
              )}
              <p className="mt-1 text-xs leading-relaxed text-black/55 antialiased">{card.body}</p>
            </div>
            {card.showChevron && (
              <span className="shrink-0 text-black/35" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            )}
          </div>
        </Link>
      ))}
    </section>
  );
}

export default HomeTemplateCards;
