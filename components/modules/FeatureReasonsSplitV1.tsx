/**
 * Module: feature.reasons-split.v1
 *
 * Fixed 50/50 split panel: text + structured reasons left, full-height image right.
 * Image crops responsibly. Default: text-left / image-right.
 *
 * Classification: new module — reusable split content module
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { FeatureReasonsSplitV1Content } from '@/lib/modules/types';

interface Props {
  content: FeatureReasonsSplitV1Content;
}

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

  return (
    <section className="mx-auto max-w-3xl overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Left — text + reasons */}
        <div className="flex flex-1 flex-col justify-center px-6 py-14 sm:px-10 sm:py-16 lg:px-14 lg:py-20">
          <div className="max-w-3xl">
            <h2 className="antialiased mb-8 font-sans text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl lg:leading-tight">
              {content.heading}
            </h2>

            <ul className="space-y-6">
              {content.items.map((item, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <span className="antialiased text-xs font-semibold uppercase tracking-widest text-brand-900">
                    {item.label}
                  </span>
                  <span className="antialiased text-base font-light leading-relaxed text-brand-900/70">
                    {item.sentence}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right — full-height image */}
        <div className="relative h-72 w-full flex-shrink-0 md:h-auto md:w-1/2 lg:w-[50%]">
          <Image
            src={imgSrc}
            alt={content.imageAlt ?? content.heading}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </div>
    </section>
  );
}
