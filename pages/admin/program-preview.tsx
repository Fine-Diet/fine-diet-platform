import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import ProgramsPage from '@/pages/programs';
import ProgramMarketingPage from '@/pages/programs/[series]/[program]';
import ProgramSeriesPage from '@/pages/programs/[series]';
import { ProgramPreviewShell } from '@/components/admin/programPreview/ProgramPreviewShell';
import { ProgramStatePreview } from '@/components/admin/programPreview/ProgramStatePreview';
import {
  PROGRAM_PREVIEW_SURFACES,
  PROGRAM_PREVIEW_STATES,
  getProgramPreviewCapacity,
  getProgramPreviewResolution,
  getProgramPreviewState,
  getProgramPreviewSurface,
  resolveProgramPreviewRuntime,
  type ProgramPreviewSurface,
} from '@/lib/programs/programPreviewFixtures';
import { getPublishedProgramSeries } from '@/lib/programs/programSeriesCatalogue';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';

interface Props {
  user: AuthenticatedUser;
  surface: ProgramPreviewSurface;
  stateId: string;
  programSlug: string;
  capacity: string;
  day: number;
  showFooter: boolean;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function SurfaceHub({
  programSlug,
  stateId,
  capacity,
  day,
  showFooter,
}: {
  programSlug: string;
  stateId: string;
  capacity: string;
  day: number;
  showFooter: boolean;
}) {
  const shared = new URLSearchParams({
    program: programSlug,
    state: stateId,
    capacity,
    day: String(day),
  });
  if (!showFooter) shared.set('footer', '0');

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {PROGRAM_PREVIEW_SURFACES.map((surface) => {
        const search = new URLSearchParams(shared);
        search.set('surface', surface.id);
        if (surface.id === 'checkin-panel') {
          search.set('state', 'active-day-7-checkin-due');
          search.set('day', '7');
        }
        if (surface.id === 'recommendation-reveal') {
          search.set('state', 'day-21-handled-recommendation');
          search.set('day', '21');
        }
        return (
          <Link
            key={surface.id}
            href={`/admin/program-preview?${search.toString()}`}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-denim-200 hover:shadow"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-denim-700">
              Preview surface
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950">
              {surface.label}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {surface.description}
            </p>
          </Link>
        );
      })}
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">
        <h2 className="text-lg font-semibold">Admin authoring map</h2>
        <p className="mt-2">
          Approved agents/admin users add program content through
          <Link className="font-semibold underline" href="/admin/programs">
            {' '}
            /admin/programs
          </Link>
          , series through
          <Link className="font-semibold underline" href="/admin/program-series">
            {' '}
            /admin/program-series
          </Link>
          , delivery modules inside each program editor, offers through
          <Link className="font-semibold underline" href="/admin/offers">
            {' '}
            /admin/offers
          </Link>
          , and Program Access through
          <Link className="font-semibold underline" href="/admin/entitlements">
            {' '}
            /admin/entitlements
          </Link>
          .
        </p>
        <p className="mt-2 font-semibold">
          Preview does not grant access or mutate runtime state.
        </p>
      </div>
    </div>
  );
}

function PublicPreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[2rem] border border-gray-300 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Public page fixture frame. Links and checkout CTAs are non-interactive in
        preview.
      </div>
      <div className="pointer-events-none max-h-[900px] overflow-auto" aria-hidden>
        {children}
      </div>
    </div>
  );
}

export default function AdminProgramPreviewPage({
  user: _user,
  surface,
  stateId,
  programSlug,
  capacity,
  day,
  showFooter,
}: Props) {
  const preview = resolveProgramPreviewRuntime({
    stateId,
    capacity,
    day,
    programSlug,
  });
  const selectedState = getProgramPreviewState(stateId);
  const selectedCapacity = getProgramPreviewCapacity(capacity);
  const resolution =
    getProgramPreviewResolution(programSlug) ??
    getProgramPreviewResolution('baseline');
  const series = resolution?.series ?? getPublishedProgramSeries()[0];

  return (
    <>
      <Head>
        <title>Program Preview · Fine Diet Admin</title>
      </Head>
      <ProgramPreviewShell
        surface={surface}
        stateId={selectedState.id}
        programSlug={programSlug}
        capacity={selectedCapacity}
        day={preview.day}
        showFooter={showFooter}
      >
        {surface === 'hub' && (
          <SurfaceHub
            programSlug={programSlug}
            stateId={selectedState.id}
            capacity={selectedCapacity}
            day={preview.day}
            showFooter={showFooter}
          />
        )}

        {surface === 'public-catalogue' && (
          <PublicPreviewFrame>
            <ProgramsPage programSeries={getPublishedProgramSeries()} />
          </PublicPreviewFrame>
        )}

        {surface === 'public-series' && series && (
          <PublicPreviewFrame>
            <ProgramSeriesPage series={series} />
          </PublicPreviewFrame>
        )}

        {surface === 'public-program' && resolution && (
          <PublicPreviewFrame>
            <ProgramMarketingPage resolution={resolution} />
          </PublicPreviewFrame>
        )}

        {surface === 'app-hub' && (
          <ProgramStatePreview
            preview={preview}
            showFooter={showFooter}
            mode="app-hub"
          />
        )}

        {surface === 'app-detail' && (
          <ProgramStatePreview
            preview={preview}
            showFooter={showFooter}
            mode="app-detail"
          />
        )}

        {surface === 'delivery-modules' && (
          <ProgramStatePreview
            preview={preview}
            showFooter={showFooter}
            mode="delivery-modules"
          />
        )}

        {surface === 'checkin-panel' && (
          <ProgramStatePreview
            preview={preview}
            showFooter={showFooter}
            mode="checkin-panel"
          />
        )}

        {surface === 'recommendation-reveal' && (
          <ProgramStatePreview
            preview={preview}
            showFooter={showFooter}
            mode="recommendation-reveal"
          />
        )}
      </ProgramPreviewShell>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/program-preview',
        permanent: false,
      },
    };
  }

  const surface = getProgramPreviewSurface(firstParam(context.query.surface));
  const state = getProgramPreviewState(firstParam(context.query.state));
  const capacity = getProgramPreviewCapacity(firstParam(context.query.capacity));
  const programSlug = firstParam(context.query.program) ?? 'baseline';
  const rawDay = Number(firstParam(context.query.day));
  const day = Number.isFinite(rawDay) ? Math.min(21, Math.max(0, rawDay)) : state.day ?? 1;
  const showFooter = firstParam(context.query.footer) !== '0';

  return {
    props: {
      user,
      surface,
      stateId: state.id,
      programSlug,
      capacity,
      day,
      showFooter,
    },
  };
};
