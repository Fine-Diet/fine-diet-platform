import Link from 'next/link';
import type {
  ProgramPreviewStateId,
  ProgramPreviewSurface,
} from '@/lib/programs/programPreviewFixtures';
import {
  PROGRAM_PREVIEW_CAPACITIES,
  PROGRAM_PREVIEW_STATES,
  PROGRAM_PREVIEW_SURFACES,
  getProgramPreviewProgramSlugs,
} from '@/lib/programs/programPreviewFixtures';
import type { ProgramCapacity } from '@/lib/programs/runtimeTypes';

interface ProgramPreviewShellProps {
  surface: ProgramPreviewSurface;
  stateId: ProgramPreviewStateId;
  programSlug: string;
  capacity: ProgramCapacity;
  day: number;
  showFooter: boolean;
  children: React.ReactNode;
}

function previewHref(params: {
  surface?: ProgramPreviewSurface;
  state?: ProgramPreviewStateId;
  program?: string;
  capacity?: ProgramCapacity;
  day?: number;
  showFooter?: boolean;
}): string {
  const search = new URLSearchParams();
  if (params.surface && params.surface !== 'hub') {
    search.set('surface', params.surface);
  }
  if (params.state) search.set('state', params.state);
  if (params.program) search.set('program', params.program);
  if (params.capacity) search.set('capacity', params.capacity);
  if (typeof params.day === 'number') search.set('day', String(params.day));
  if (params.showFooter === false) search.set('footer', '0');
  const query = search.toString();
  return query ? `/admin/program-preview?${query}` : '/admin/program-preview';
}

function ControlLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active
          ? 'border-brand-900 bg-brand-900 text-white'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
      }`}
    >
      {children}
    </Link>
  );
}

export function ProgramPreviewShell({
  surface,
  stateId,
  programSlug,
  capacity,
  day,
  showFooter,
  children,
}: ProgramPreviewShellProps) {
  const programSlugs = getProgramPreviewProgramSlugs();

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/admin"
            className="mb-3 inline-block text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Admin
          </Link>
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-denim-700">
                  Program design preview
                </p>
                <h1 className="mt-2 text-3xl font-bold text-gray-950">
                  Program Preview
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
                  Admin/editor-only fixture preview for public pages, app
                  runtime states, modules, check-ins, and recommendations. This
                  route does not grant access, create enrollments, create
                  entitlements, or start checkout.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                Mutations disabled. Use real admin tools for authoring:
                <br />
                <Link className="font-semibold underline" href="/admin/programs">
                  Programs
                </Link>
                {' · '}
                <Link
                  className="font-semibold underline"
                  href="/admin/program-series"
                >
                  Series
                </Link>
                {' · '}
                <Link className="font-semibold underline" href="/admin/offers">
                  Offers
                </Link>
                {' · '}
                <Link
                  className="font-semibold underline"
                  href="/admin/entitlements"
                >
                  Entitlements
                </Link>
              </div>
            </div>
          </div>
        </div>

        <aside className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Surface
              </p>
              <div className="flex flex-wrap gap-2">
                <ControlLink
                  active={surface === 'hub'}
                  href={previewHref({
                    state: stateId,
                    program: programSlug,
                    capacity,
                    day,
                    showFooter,
                  })}
                >
                  Hub
                </ControlLink>
                {PROGRAM_PREVIEW_SURFACES.map((option) => (
                  <ControlLink
                    key={option.id}
                    active={surface === option.id}
                    href={previewHref({
                      surface: option.id,
                      state: stateId,
                      program: programSlug,
                      capacity,
                      day,
                      showFooter,
                    })}
                  >
                    {option.label}
                  </ControlLink>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Runtime state
              </p>
              <div className="flex flex-wrap gap-2">
                {PROGRAM_PREVIEW_STATES.map((option) => (
                  <ControlLink
                    key={option.id}
                    active={stateId === option.id}
                    href={previewHref({
                      surface,
                      state: option.id,
                      program: programSlug,
                      capacity,
                      day: option.day ?? day,
                      showFooter,
                    })}
                  >
                    {option.label}
                  </ControlLink>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Program
              </span>
              <select
                value={programSlug}
                onChange={(event) => {
                  window.location.href = previewHref({
                    surface,
                    state: stateId,
                    program: event.target.value,
                    capacity,
                    day,
                    showFooter,
                  });
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {programSlugs.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Capacity
              </span>
              <select
                value={capacity}
                onChange={(event) => {
                  window.location.href = previewHref({
                    surface,
                    state: stateId,
                    program: programSlug,
                    capacity: event.target.value as ProgramCapacity,
                    day,
                    showFooter,
                  });
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {PROGRAM_PREVIEW_CAPACITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Day
              </span>
              <input
                type="number"
                min={0}
                max={21}
                value={day}
                onChange={(event) => {
                  window.location.href = previewHref({
                    surface,
                    state: stateId,
                    program: programSlug,
                    capacity,
                    day: Number(event.target.value),
                    showFooter,
                  });
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>

            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Footer
              </span>
              <ControlLink
                active={showFooter}
                href={previewHref({
                  surface,
                  state: stateId,
                  program: programSlug,
                  capacity,
                  day,
                  showFooter: !showFooter,
                })}
              >
                {showFooter ? 'Footer shown' : 'Footer hidden'}
              </ControlLink>
            </div>
          </div>
        </aside>

        {children}
      </div>
    </div>
  );
}
