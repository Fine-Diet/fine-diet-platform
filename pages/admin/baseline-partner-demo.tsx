import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { ProgramBlueprintRenderer } from '@/components/journal/programs/ProgramBlueprintRenderer';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import {
  BASELINE_DAY_0_TO_21_BLUEPRINT,
} from '@/lib/programs/baselineDay0To21Candidate';
import type { ProgramBlueprint } from '@/lib/programs/programBlueprint';
import { resolveProgramPreviewRuntime } from '@/lib/programs/programPreviewFixtures';
import type { ProgramLibraryDetail } from '@/lib/programs/programLibraryServerService';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';

interface Props {
  user: AuthenticatedUser;
  blueprint: ProgramBlueprint;
  detail: ProgramLibraryDetail;
  runtimeSummary: ProgramRuntimeSummary;
  selectedDay: number;
}

const noOp = () => undefined;

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function deny() {
  return {
    redirect: {
      destination: '/login?redirect=/admin/baseline-partner-demo',
      permanent: false,
    },
  } as const;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  context.res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  context.res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return deny();
  }

  const blueprint = BASELINE_DAY_0_TO_21_BLUEPRINT;
  const rawDay = queryValue(context.query.day);
  const selectedDay = Math.max(
    0,
    Math.min(blueprint.version.durationDays, Number.parseInt(rawDay ?? '0', 10) || 0),
  );
  const fixture = resolveProgramPreviewRuntime({
    stateId: 'active-day-21-checkin-due',
    day: blueprint.version.durationDays,
    programSlug: blueprint.identity.slug,
  });
  if (!fixture.runtimeSummary) {
    return { notFound: true };
  }

  const programId = '00000000-0000-4000-8000-000000000022';
  const versionId = '00000000-0000-4000-8000-000000000021';
  const runtimeSummary: ProgramRuntimeSummary = {
    ...fixture.runtimeSummary,
    current_day: blueprint.version.durationDays,
    version: {
      ...fixture.runtimeSummary.version,
      id: versionId,
      program_id: programId,
      version_key: blueprint.version.key,
      version_label: `${blueprint.version.label} · simulated read-only review`,
      duration_days: blueprint.version.durationDays,
      status: 'draft',
    },
    enrollment: {
      ...fixture.runtimeSummary.enrollment,
      program_id: programId,
      program_slug: blueprint.identity.slug,
      program_version_id: versionId,
    },
    program: {
      ...fixture.runtimeSummary.program,
      id: programId,
      slug: blueprint.identity.slug,
      title: blueprint.identity.title,
      description: blueprint.identity.description,
    },
  };
  const detail: ProgramLibraryDetail = {
    ...fixture.libraryDetail,
    slug: blueprint.identity.slug,
    title: blueprint.identity.title,
    description: blueprint.identity.description,
    has_entitlement: true,
    access_state: 'assigned_only',
  };

  return {
    props: {
      user,
      blueprint,
      detail,
      runtimeSummary,
      selectedDay,
    },
  };
};

export default function BaselinePartnerDemoPage({
  blueprint,
  detail,
  runtimeSummary,
  selectedDay,
}: Props) {
  return (
    <>
      <Head>
        <title>Baseline Days 0–21 · read-only review</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07170f] px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Baseline · Days 0–21</p>
            <p className="text-xs text-white/60">
              Simulated read-only review · source-authored candidate · no enrollment, save, or publication
            </p>
          </div>
          <nav aria-label="Review a day" className="flex max-w-full flex-wrap gap-1">
            {blueprint.days.map((entry) => (
              <Link
                key={entry.day}
                href={`/admin/baseline-partner-demo?day=${entry.day}`}
                className={`rounded-full border px-2 py-1 text-xs ${
                  entry.day === selectedDay
                    ? 'border-white bg-white text-black'
                    : 'border-white/30 text-white'
                }`}
              >
                D{entry.day}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <ProgramBlueprintRenderer
        blueprint={blueprint}
        data={detail}
        runtimeSummary={runtimeSummary}
        progressSummary={null}
        previewMode
        initialSelectedDay={selectedDay}
        initialStartGateOpen={false}
        onRuntimeSummaryUpdate={noOp}
      />
    </>
  );
}
