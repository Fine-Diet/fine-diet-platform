/**
 * Module: feature.reasons-split.v1
 *
 * Journal/app integration split panel. Mirrors the code-owned
 * `CategoryAppIntegration` section (components/programs/ProgramCategoryView.tsx,
 * source commit ccb5d329da2c304bb2930d098fe6022c95dbe7b6) so a composition can
 * reproduce it at parity:
 *   - split layout when an image is present (copy/reasons column + image column)
 *   - reasons-only fallback when no image
 *   - bg-brand-50, border-b border-brand-900/20
 *   - brand-900 heading + body + reason labels, brand-900/70 reason sentences
 *
 * The optional `body` lead paragraph matches CategoryAppIntegration's body copy;
 * it renders only when authored.
 *
 * Classification: reusable split content module.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { FeatureReasonsSplitV1Content } from '@/lib/modules/types';

interface Props {
  content: FeatureReasonsSplitV1Content;
}

/**
 * Wide pill CTA, mirroring the shared PrimaryPillCta treatment used across the
 * Programs surfaces (denim gradient / solid brand-900). Rendered inline here so
 * the module stays self-contained and authored (label + href), without coupling
 * to the catalogue CTA resolver. Renders only when both label and href exist.
 */
const CTA_PILL_STRUCTURE =
  'inline-block rounded-full px-8 py-4 text-center text-base font-semibold antialiased transition-opacity duration-200 hover:opacity-90 sm:py-5';

const CTA_PILL_TONES = {
  denim: 'bg-gradient-to-bl from-denim-500 to-denim-900 text-neutral-900',
  brand: 'bg-brand-900 text-white',
} as const;

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

export function FeatureReasonsSplitV1({ content }: Props) {
  const isMobile = useIsMobile();
  const imgSrc = isMobile ? content.imageMobile : content.imageDesktop;
  const hasImage = Boolean(content.imageDesktop || content.imageMobile);

  const reasons = (
    <ul className="mt-10 grid grid-cols-[max-content_1fr] gap-x-8 gap-y-5">
      {content.items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="contents">
          <span className="self-start text-base font-semibold uppercase tracking-[-0.01em] text-brand-900 antialiased">
            {item.label}
          </span>
          <span className="self-start text-base font-light leading-relaxed text-brand-900/70 antialiased">
            {item.sentence}
          </span>
        </li>
      ))}
    </ul>
  );

  // Optional large CTA inside the copy column, below the reasons stack. Renders
  // only when BOTH label and href are authored (backward compatible).
  const cta =
    content.ctaLabel && content.ctaHref ? (
      <div className="mt-10">
        <Link
          href={content.ctaHref}
          className={`${CTA_PILL_STRUCTURE} ${CTA_PILL_TONES[content.ctaTone ?? 'denim']}`}
        >
          {content.ctaLabel}
        </Link>
      </div>
    ) : null;

  if (hasImage) {
    return (
      <section className="overflow-hidden border-b border-brand-900/20 bg-brand-50">
        <div className="grid min-h-[30rem] lg:grid-cols-2">
          <div className="order-2 flex items-center px-6 py-16 sm:px-12 lg:order-1 lg:justify-end lg:px-14 lg:py-20">
            <div className="mx-auto w-full max-w-3xl lg:mx-0 lg:max-w-[30rem]">
              <h2 className="max-w-2xl text-3xl font-semibold leading-[0.95] tracking-[-0.035em] text-brand-900 antialiased sm:text-4xl lg:max-w-md">
                {content.heading}
              </h2>
              {content.body && (
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-900/68 antialiased lg:max-w-md">
                  {content.body}
                </p>
              )}
              {reasons}
              {cta}
            </div>
          </div>
          <div className="relative order-1 min-h-[22rem] w-full bg-brand-100 lg:order-2 lg:min-h-[30rem]">
            <Image
              src={imgSrc}
              alt={content.imageAlt ?? content.heading}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden border-b border-brand-900/20 bg-brand-50 px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-brand-900 antialiased sm:text-4xl">
          {content.heading}
        </h2>
        {content.body && (
          <p className="mt-4 text-base leading-relaxed text-brand-900/68 antialiased">
            {content.body}
          </p>
        )}
        {reasons}
        {cta}
      </div>
    </section>
  );
}
