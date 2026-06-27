/**
 * Module: hero.standard.v1
 *
 * Full or medium-height hero section with a responsive background image,
 * centered headline/subheadline, and CTA buttons.
 *
 * Visual design mirrors the existing HeroSection / HeroMediumSection
 * components but accepts the module content contract directly — no
 * coupling to HomeContent.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';
import type { HeroStandardV1Content } from '@/lib/modules/types';

// Wide pill treatment mirrors the shared PrimaryPillCta (denim gradient) used
// across the public Programs surfaces, kept inline so this generic hero module
// stays decoupled from the Programs component layer.
const HERO_PRIMARY_PILL =
  'mx-auto block w-full max-w-2xl rounded-full bg-gradient-to-bl from-denim-500 to-denim-900 px-8 py-4 text-center text-base font-semibold text-neutral-900 antialiased transition-opacity duration-200 hover:opacity-90 sm:py-5';
const HERO_SECONDARY_LINK =
  'text-sm font-medium text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline';

interface Props {
  content: HeroStandardV1Content;
}

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

export function HeroStandardV1({ content }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const bgSrc = isMobile ? content.images.mobile : content.images.desktop;
  const heightClass =
    content.height === 'medium' ? 'h-[66vh] sm:h-[65vh]' : 'h-[99vh] sm:h-[97vh]';

  return (
    <section className="relative isolate overflow-hidden rounded-b-[2.5rem]">
      <div className="absolute inset-0">
        <Image
          src={bgSrc}
          alt={content.images.alt ?? content.headline}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/30" />
      </div>

      <div
        className={`relative mx-auto flex ${heightClass} max-w-[1200px] flex-col items-center justify-center gap-2 px-6 py-0 text-center sm:px-10`}
      >
        <div className="max-w-2xl text-white">
          <h1 className="antialiased whitespace-pre-line text-hero-mobile font-sans font-semibold leading-none sm:text-6xl lg:text-6xl lg:leading-none">
            {content.headline}
          </h1>
          {content.subheadline && (
            <p className="antialiased mt-2 text-lg font-light leading-6 text-white">
              {content.subheadline}
            </p>
          )}
          {content.body && (
            <p className="antialiased mt-2 text-base font-light leading-5 text-white/80">
              {content.body}
            </p>
          )}
        </div>

        {content.ctaPrimaryLabel && content.ctaPrimaryHref ? (
          <div className="w-full max-w-2xl">
            <Link href={content.ctaPrimaryHref} className={HERO_PRIMARY_PILL}>
              {content.ctaPrimaryLabel}
            </Link>
            {content.ctaSecondaryLabel && content.ctaSecondaryHref && (
              <div className="mt-4 flex justify-center">
                <Link href={content.ctaSecondaryHref} className={HERO_SECONDARY_LINK}>
                  {content.ctaSecondaryLabel}
                </Link>
              </div>
            )}
          </div>
        ) : (
          content.buttons &&
          content.buttons.length > 0 && (
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              {content.buttons.map((btn) => (
                <Button
                  key={btn.label}
                  variant={btn.variant ?? 'primary'}
                  size="lg"
                  onClick={() => router.push(btn.href)}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
}
