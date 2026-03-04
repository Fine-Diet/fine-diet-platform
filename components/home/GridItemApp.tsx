import Image from 'next/image';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { SummaryRowModule } from '@/lib/summaryRowTypes';

export interface GridItemAppProps {
  module: SummaryRowModule;
}

/**
 * GridItemApp — Same visual treatment as GridItemMedium (background image,
 * gradient overlay, rounded-[2.5rem], 215px, white copy bottom-left) but
 * renders summary_row schema data instead of title + description + button.
 * A chevron on the right links to the drilldown page.
 */
export function GridItemApp({ module: mod }: GridItemAppProps) {
  const isEmpty = mod.empty?.isEmpty ?? false;
  const drilldownHref = mod.drilldown?.href ?? '#';

  const card = (
    <div className="relative isolate overflow-hidden rounded-md h-[140px] group">
      {/* Background image + gradient overlay (matches GridItemMedium) */}
      {mod.image ? (
        <div className="absolute inset-0">
          <Image
            src={mod.image}
            alt={mod.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 325px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/40" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-neutral-700" />
      )}

      {/* Content + chevron — vertically centered, max 650px interior, horizontally centered */}
      <div className="relative h-full flex items-center justify-center">
        <div className="w-full max-w-[650px] flex items-center p-5 md:p-6">
        <div className="flex-1 min-w-0">
          {isEmpty && mod.empty ? (
            /* ── Empty state ── */
            <div className="space-y-[1px]">
              <h3 className="antialiased text-3xl font-semibold text-white leading-tight">{mod.title}</h3>
              <p className="antialiased text-lg font-semibold text-white leading-tight">
                {mod.empty.headline ?? 'No data yet'}
              </p>
              {mod.empty.body && (
                <p className="antialiased text-sm font-light text-white/70 leading-snug">{mod.empty.body}</p>
              )}
              {mod.empty.cta && (
                <p className="antialiased text-sm font-medium text-white/80 leading-snug">{mod.empty.cta.label}</p>
              )}
            </div>
          ) : (
            /* ── Populated state ── */
            <div className="space-y-[.75px]">
              <h3 className="antialiased text-3xl font-semibold text-white leading-tight">{mod.title}</h3>

              {mod.primary && (
                <p className="antialiased text-lg font-semibold text-white leading-snug">
                  {mod.primary.value}
                  {mod.primary.unit != null && (
                    <span className="font-semibold"> {mod.primary.unit}</span>
                  )}
                  {mod.primary.note && (
                    <span className="text-sm font-light text-white/70 ml-1">({mod.primary.note})</span>
                  )}
                </p>
              )}

              {mod.metrics && mod.metrics.length > 0 && (
                <p className="antialiased text-sm text-white/80 leading-snug">
                  {mod.metrics.slice(0, 2).map((m, i) => (
                    <span key={i}>
                      {i > 0 && <span className="mx-1 font-light">·</span>}
                      <span className="font-semibold">{m.value}{m.unit != null ? m.unit : ''}</span>
                      <span className="font-light"> {m.label.toLowerCase()}</span>
                    </span>
                  ))}
                </p>
              )}

              {mod.status && (
                <p className="antialiased text-sm text-white/60 leading-snug">
                  <span className="font-light">Status: </span>
                  <span className="font-semibold">{mod.status.label}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Drilldown chevron */}
        <div className="flex-shrink-0 ml-3">
          <ChevronRightIcon
            className="h-5 w-5 text-white/50 group-hover:text-white/80 transition-colors"
            strokeWidth={2}
          />
        </div>
        </div>
      </div>
    </div>
  );

  if (isEmpty && mod.empty?.cta?.href) {
    return <Link href={mod.empty.cta.href} className="block">{card}</Link>;
  }

  return <Link href={drilldownHref} className="block">{card}</Link>;
}
