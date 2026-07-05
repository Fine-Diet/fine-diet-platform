/**
 * Admin Page: Assessment Creation Wizard v1 (Packet L)
 *
 * Planning-only, non-persistent wizard at /admin/assessments/create. Walks an
 * admin through the factory/creation-plan metadata and emits a copyable
 * planning/engineering handoff. Does NOT create, register, route, publish, or
 * persist an assessment.
 *
 * Uses the same admin SSR/auth pattern as /admin/assessments (editor or admin).
 * Supports low-risk prefill via ?concept=<planned-concept-id>; an unknown
 * concept id falls back to a blank draft and surfaces a friendly notice.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import AssessmentCreationWizard from '@/components/admin/operationsContract/AssessmentCreationWizard';

interface CreateWizardPageProps {
  user: AuthenticatedUser | null;
  initialConceptId: string | null;
}

export default function CreateWizardPage({ user, initialConceptId }: CreateWizardPageProps) {
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Create Assessment Wizard • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Admin</h1>
            <p className="text-lg text-gray-600 mb-8">
              You don&apos;t have permission to access this area.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Return to Home
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Create Assessment Wizard • Fine Diet Admin</title>
      </Head>
      <div className="py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link
              href="/admin/assessments"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Assessments
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Create Assessment Wizard
            </h1>
            <p className="text-lg text-gray-600">
              Plan a new assessment and generate an engineering handoff. Planning-only — nothing here is persisted, live, or public.
            </p>
          </div>

          <AssessmentCreationWizard initialConceptId={initialConceptId} />
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<CreateWizardPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, initialConceptId: null } };
  }
  const raw = typeof context.query.concept === 'string' ? context.query.concept : null;
  const initialConceptId = raw && raw.trim().length > 0 ? raw.trim() : null;
  return { props: { user, initialConceptId } };
};
