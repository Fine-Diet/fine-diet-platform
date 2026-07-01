/**
 * Module: cta.program-offer.v1
 *
 * A program-aware marketing CTA band. The editor authors surrounding copy and
 * points the module at a program collection (and optionally a specific program)
 * by slug; the button label, link, availability (coming_soon / planned ->
 * disabled), checkout offer routing, and the secondary CTA all come from the
 * centralized `resolveProgramMarketingCta` via `resolveProgramOfferModuleCta`.
 *
 * This is the doctrine-aligned way to surface offer/entitlement-true CTAs inside
 * the reusable composition system: offer truth stays centralized, never typed
 * into composition content.
 *
 * Presentational only (no hooks) — safe for SSR and direct unit-test rendering.
 * If the referenced collection/program can't be resolved, the module renders
 * nothing (graceful skip), matching the renderer's per-module failure policy.
 */

import type { CtaProgramOfferV1Content } from '@/lib/modules/types';
import { resolveProgramOfferModuleCta } from '@/lib/programs/programOfferModuleCta';
import { cn } from '@/lib/utils';
import {
  PrimaryPillCta,
  SecondaryCtaLink,
} from '@/components/programs/PrimaryPillCta';

interface Props {
  content: CtaProgramOfferV1Content;
}

export function CtaProgramOfferV1({ content }: Props) {
  const resolved = resolveProgramOfferModuleCta({
    collectionSlug: content.collectionSlug,
    programSlug: content.programSlug,
  });

  if (!resolved) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[cta.program-offer.v1] Could not resolve CTA for collection "${content.collectionSlug}"` +
          (content.programSlug ? ` / program "${content.programSlug}"` : ''),
      );
    }
    return null;
  }

  const { cta } = resolved;
  const isDark = content.surface === 'dark';
  const isCenter = (content.align ?? 'center') === 'center';
  // 'primary-only' suppresses the secondary link + helper text for true parity
  // with the preview-era CategoryIntro (single primary CTA). Defaults to 'full'.
  const primaryOnly = content.ctaStyle === 'primary-only';

  return (
    <section
      className={cn(
        'px-6 py-16 sm:py-20',
        isDark ? 'bg-brand-900 text-white' : 'bg-brand-50 text-brand-900',
      )}
    >
      <div className={cn('mx-auto max-w-3xl', isCenter ? 'text-center' : 'text-left')}>
        {content.eyebrow && (
          <p
            className={cn(
              'text-xs font-semibold uppercase tracking-[0.24em]',
              isDark ? 'text-white/58' : 'text-brand-900/45',
            )}
          >
            {content.eyebrow}
          </p>
        )}
        {content.heading && (
          <h2
            className={cn(
              'mt-3 text-3xl font-semibold leading-tight antialiased sm:text-4xl',
              isCenter ? 'mx-auto max-w-2xl' : undefined,
            )}
          >
            {content.heading}
          </h2>
        )}
        {content.body && (
          <p
            className={cn(
              'mt-4 text-base leading-relaxed',
              isDark ? 'text-white/78' : 'text-brand-900/68',
              isCenter ? 'mx-auto max-w-xl' : 'max-w-xl',
            )}
          >
            {content.body}
          </p>
        )}

        <div
          className={cn(
            'mt-8 flex flex-col gap-4',
            isCenter ? 'items-center' : 'items-start',
          )}
        >
          <PrimaryPillCta cta={cta} wide />
          {!primaryOnly && (
            <SecondaryCtaLink cta={cta} tone={isDark ? 'light' : 'dark'} />
          )}
        </div>

        {!primaryOnly && cta.helperText && (
          <p
            className={cn(
              'mt-5 text-xs leading-5 antialiased',
              isDark ? 'text-white/55' : 'text-brand-900/55',
              isCenter ? 'mx-auto max-w-xl' : 'max-w-xl',
            )}
          >
            {cta.helperText}
          </p>
        )}
      </div>
    </section>
  );
}
