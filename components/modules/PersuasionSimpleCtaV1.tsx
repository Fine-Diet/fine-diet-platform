/**
 * Module: persuasion.simple-cta.v1
 *
 * Standalone persuasion block. Supports two variants:
 *   - 'list'      — heading + short intro + structured list + full-width CTA
 *   - 'paragraph' — heading + body paragraphs + full-width CTA
 *
 * Classification: new module — reusable persuasion family
 * CTA: always full-width link pill, spanning container width.
 */

import Link from 'next/link';
import type { PersuasionSimpleCtaV1Content } from '@/lib/modules/types';

interface Props {
  content: PersuasionSimpleCtaV1Content;
}

export function PersuasionSimpleCtaV1({ content }: Props) {
  const variant = content.variant ?? 'list';

  return (
    <section className="px-6 py-14 sm:px-10 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="antialiased mb-5 font-sans text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl lg:text-5xl lg:leading-tight">
          {content.heading}
        </h2>

        {variant === 'list' && (
          <>
            {content.intro && (
              <p className="antialiased mb-3 text-base font-light leading-relaxed text-brand-900/70">
                {content.intro}
              </p>
            )}
            {content.items && content.items.length > 0 && (
              <ul className="mb-8">
                {content.items.map((item, i) => (
                  <li key={i} className="antialiased flex items-start gap-3 text-base font-light leading-normal text-brand-900/80">
                    <span className="flex-shrink-0 text-brand-900/40">&mdash;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {variant === 'paragraph' && (
          <div className="mb-8 space-y-4">
            {content.bodyParagraphs?.map((para, i) => (
              <p key={i} className="antialiased text-base font-light leading-relaxed text-brand-900/70">
                {para}
              </p>
            ))}
            {content.items && content.items.length > 0 && (
              <ul className="mt-4 space-y-2">
                {content.items.map((item, i) => (
                  <li key={i} className="antialiased flex items-start gap-3 text-base font-light leading-relaxed text-brand-900/80">
                    <span className="mt-px flex-shrink-0 text-brand-900/40">&mdash;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Link
          href={content.ctaHref}
          className="block w-full rounded-full bg-gradient-to-bl from-dark_accent-500 to-dark_accent-900 px-8 py-4 text-center text-base font-semibold text-neutral-900 antialiased transition-opacity duration-200 hover:opacity-90 sm:py-5"
        >
          {content.ctaLabel}
        </Link>
      </div>
    </section>
  );
}
