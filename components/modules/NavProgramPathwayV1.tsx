/**
 * Module: nav.program-pathway.v1
 *
 * Resolver-driven pathway navigation for a single program. Authored content owns
 * ONLY the collection + program slugs; the breadcrumb, step position, and the
 * previous/next links are all resolved from the code catalogue via
 * `getProgramSeriesProgramBySlugs`. This keeps the program sequence and links
 * centralized — a composition can never hand-author them.
 *
 * Edge cases handled cleanly:
 *  - unknown collection/program → renders nothing (null)
 *  - first program            → "Previous" shows the first-step placeholder
 *  - last program             → "Next" shows the final-step placeholder
 *  - single-program collection → both placeholders, "Step 1 of 1"
 *
 * Hook-free (native links only), so it is SSR-safe and directly unit-testable.
 */

import Link from 'next/link';
import type { NavProgramPathwayV1Content } from '@/lib/modules/types';
import { getProgramSeriesProgramBySlugs } from '@/lib/programs/programSeriesCatalogue';

interface Props {
  content: NavProgramPathwayV1Content;
}

export function NavProgramPathwayV1({ content }: Props) {
  const resolution = getProgramSeriesProgramBySlugs(
    content.collectionSlug,
    content.programSlug,
  );

  if (!resolution) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[nav.program-pathway.v1] Unknown program "${content.collectionSlug}/${content.programSlug}"`,
      );
    }
    return null;
  }

  // `resolution.series` is the storage-aligned field name; it is the Collection.
  const { series: collection, program, index, previousProgram, nextProgram } =
    resolution;
  const total = collection.programs.length;

  return (
    <section className="px-6 py-14">
      <div className="mx-auto max-w-5xl space-y-6">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-brand-900/60"
        >
          <Link
            href="/programs"
            className="underline-offset-4 hover:text-brand-900 hover:underline"
          >
            Programs
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={`/programs/${collection.slug}`}
            className="underline-offset-4 hover:text-brand-900 hover:underline"
          >
            {collection.title}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-brand-900/80">{program.title}</span>
        </nav>

        <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
            Pathway context
          </p>
          <h2 className="mt-2 text-2xl font-semibold antialiased">
            Step {index + 1} of {total} in {collection.title}
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {previousProgram ? (
            <Link
              href={`/programs/${collection.slug}/${previousProgram.slug}`}
              className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm transition hover:border-brand-200"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
                Previous
              </p>
              <p className="mt-2 font-semibold antialiased">
                {previousProgram.title}
              </p>
            </Link>
          ) : (
            <div className="rounded-3xl border border-brand-100 bg-white p-5 text-brand-900/42 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Previous
              </p>
              <p className="mt-2 text-sm">This is the first step.</p>
            </div>
          )}

          {nextProgram ? (
            <Link
              href={`/programs/${collection.slug}/${nextProgram.slug}`}
              className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm transition hover:border-brand-200"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
                Next
              </p>
              <p className="mt-2 font-semibold antialiased">{nextProgram.title}</p>
            </Link>
          ) : (
            <div className="rounded-3xl border border-brand-100 bg-white p-5 text-brand-900/42 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Next
              </p>
              <p className="mt-2 text-sm">This is the final listed step.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
