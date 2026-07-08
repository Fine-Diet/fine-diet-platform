/**
 * Results Page Route
 *
 * Route: /results/[submissionId]
 *
 * Legacy clean URL for accessing assessment results directly.
 * Redirects to the canonical assessment results route based on submission type.
 */

import React from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { resolveSubmissionResultsRoute } from '@/lib/assessments/results/resolveSubmissionResultsRoute';

interface ResultsPageProps {
  submissionId: string;
}

export default function ResultsPage({ submissionId }: ResultsPageProps) {
  return (
    <>
      <Head>
        <title>Your Assessment Results • Fine Diet</title>
        <meta
          name="description"
          content="View your personalized assessment results."
        />
      </Head>
      <div className="min-h-screen bg-brand-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-denim-500 border-t-transparent mb-4"></div>
          <p className="text-white text-lg">Loading results...</p>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ResultsPageProps> = async (context) => {
  const { submissionId } = context.params || {};

  if (!submissionId || typeof submissionId !== 'string') {
    return {
      notFound: true,
    };
  }

  const { data: submission } = await supabaseAdmin
    .from('assessment_submissions')
    .select('assessment_type')
    .eq('id', submissionId)
    .single();

  return {
    redirect: {
      destination: resolveSubmissionResultsRoute(
        submissionId,
        submission?.assessment_type
      ),
      permanent: false,
    },
  };
};
