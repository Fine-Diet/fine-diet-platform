/**
 * Module: comparison.table.v1
 *
 * Two-column "us vs. them" comparison table. Author-driven editorial content —
 * no catalogue, offer, or entitlement coupling.
 *
 * Mirrors the code-owned CategoryComparison section so a composition can
 * reproduce it at parity. Presentational only (no hooks) — safe for SSR and
 * direct unit-test rendering.
 */

import type { ComparisonTableV1Content } from '@/lib/modules/types';

interface Props {
  content: ComparisonTableV1Content;
}

export function ComparisonTableV1({ content }: Props) {
  if (content.rows.length === 0) return null;

  return (
    <section className="bg-brand-50 px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-brand-900 antialiased sm:text-4xl">
          {content.heading}
        </h2>
        <div className="mt-10">
          <div className="grid grid-cols-2 gap-6 border-b border-brand-900/20 pb-4 text-base font-semibold uppercase tracking-[0.04em] text-brand-900">
            <span>{content.columns.left}</span>
            <span className="text-right">{content.columns.right}</span>
          </div>
          <div>
            {content.rows.map((row, index) => (
              <div
                key={row.label ?? `${row.left}-${index}`}
                className="border-b border-brand-900/20 py-5"
              >
                {row.label && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-brand-900/45">
                    {row.label}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-6 text-base font-light leading-relaxed text-brand-900">
                  <p className="text-left">{row.left}</p>
                  <p className="text-right">{row.right}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
