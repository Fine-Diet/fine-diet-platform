/**
 * Module: cta.band.v1
 *
 * Full-width centered call-to-action band with an optional background
 * image (frosted-glass overlay) or solid fallback, headline, body
 * copy, and a single primary button.
 *
 * Renders its own markup to avoid coupling to CTASection's prop shape.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';
import type { CtaBandV1Content } from '@/lib/modules/types';

interface Props {
  content: CtaBandV1Content;
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

export function CtaBandV1({ content }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const bgSrc = content.images
    ? isMobile
      ? content.images.mobile
      : content.images.desktop
    : null;

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0">
        {bgSrc ? (
          <>
            <Image
              src={bgSrc}
              alt={content.images?.alt ?? ''}
              fill
              className="object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 backdrop-blur-lg bg-black/50" />
          </>
        ) : (
          <div className="absolute inset-0 bg-neutral-700" />
        )}
      </div>

      <div className="relative mx-auto flex h-[300px] sm:h-[280px] max-w-[1200px] flex-col items-center justify-center text-center px-6 py-16 sm:px-10 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="antialiased text-3xl font-sans font-semibold leading-tight sm:text-4xl text-white">
            {content.headline}
          </h2>
          {content.body && (
            <p className="antialiased mt-2 text-base font-light leading-5 text-white">
              {content.body}
            </p>
          )}
        </div>

        {content.button && (
          <div className="mt-4">
            <Button
              variant={content.button.variant ?? 'primary'}
              size="lg"
              onClick={() => router.push(content.button!.href)}
            >
              {content.button.label}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
