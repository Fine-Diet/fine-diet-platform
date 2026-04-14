/**
 * Module: hero.offer-blur.v1
 *
 * Immersive full-height hero with blurred editorial photography,
 * dark overlay, centered headline/subtitle, and a single wide pill CTA.
 *
 * Classification: new module — hero family variant
 * Visual identity: warm, soft, editorial blur photography; white centered text;
 *   teal pill CTA; generous breathing room.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import type { HeroOfferBlurV1Content } from '@/lib/modules/types';

interface Props {
  content: HeroOfferBlurV1Content;
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

const overlayMap = {
  light: 'bg-black/20',
  medium: 'bg-black/40',
  dark: 'bg-black/60',
} as const;

export function HeroOfferBlurV1({ content }: Props) {
  const isMobile = useIsMobile();
  const bgSrc = isMobile ? content.imageMobile : content.imageDesktop;
  const overlay = overlayMap[content.overlayStrength ?? 'dark'];

  return (
    <section className="relative isolate overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src={bgSrc}
          alt={content.title}
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className={`absolute inset-0 ${overlay}`} />
      </div>

      {/* Content */}
      <div className="relative mx-auto flex h-[99vh] max-w-[1200px] flex-col items-center justify-center gap-6 px-6 py-0 text-center sm:px-10">
        <div className="max-w-3xl text-white">
          <h1 className="antialiased whitespace-pre-line font-sans font-semibold leading-none text-hero-mobile sm:text-5xl lg:text-6xl lg:leading-none">
            {content.title}
          </h1>
          {content.subtitle && (
            <p className="antialiased mt-4 text-base font-light leading-relaxed text-white/80 sm:text-lg sm:mt-5">
              {content.subtitle}
            </p>
          )}
        </div>

        <Link
          href={content.ctaHref}
          className="mt-2 block w-full max-w-2xl rounded-full bg-gradient-to-bl from-denim-500 to-denim-900 px-8 py-4 text-center text-base font-semibold text-neutral-900 antialiased transition-opacity duration-200 hover:opacity-90 sm:py-5"
        >
          {content.ctaLabel}
        </Link>
      </div>
    </section>
  );
}
