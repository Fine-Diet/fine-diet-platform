/**
 * Admin Route: Baseline Readiness Internal Fixture Runner (Packet Q)
 *
 * GET /admin/assessments/baseline-readiness/start
 *
 * Admin/editor-gated internal runner using a code-owned fixture question set.
 * Always runs in preview mode (isPreview=true) so submissions are not persisted.
 * NOT a public route — registry status remains draft.
 */

import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { AssessmentRoot } from '@/components/assessments/AssessmentRoot';
import { PreviewBanner } from '@/components/assessments/PreviewBanner';
import { getBaselineReadinessInternalFixtureConfig } from '@/lib/assessments/internal/baselineReadinessFixture';

interface StartPageProps {
  user: AuthenticatedUser | null;
  config: ReturnType<typeof getBaselineReadinessInternalFixtureConfig> | null;
}

export default function BaselineReadinessInternalStartPage({
  user,
  config,
}: StartPageProps) {
  if (!user || (user.role !== 'editor' && user.role !== 'admin') || !config) {
    return (
      <>
        <Head>
          <title>Baseline Readiness • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Admin</h1>
            <p className="mb-8 text-lg text-gray-600">
              You don&apos;t have permission to access this area.
            </p>
            <Link href="/admin/assessments/baseline-readiness" className="text-blue-600 hover:underline">
              ← Internal hub
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Baseline Readiness Internal Runner • Fine Diet Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <PreviewBanner
        slug="baseline-readiness"
        assessmentVersion={config.assessmentVersion}
        manageHref="/admin/assessments/baseline-readiness"
      />
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-900">
        Internal proof runner — preview-only fixture. Submissions are not persisted.
      </div>
      <AssessmentRoot
        assessmentType="baseline-readiness"
        initialVersion={config.assessmentVersion}
        config={config}
        isPreview
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<StartPageProps> = async (
  context
) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, config: null } };
  }

  return {
    props: {
      user,
      config: getBaselineReadinessInternalFixtureConfig(),
    },
  };
};
