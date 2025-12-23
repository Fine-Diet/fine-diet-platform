/**
 * Results Page Route
 * 
 * Route: /results/[submissionId]
 * 
 * Clean URL format for accessing assessment results directly.
 * Redirects to canonical /gut-check?submission_id=... format for compatibility.
 */

import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';

interface ResultsPageProps {
  submissionId: string;
}

export default function ResultsPage({ submissionId }: ResultsPageProps) {
  const router = useRouter();
  
  // Redirect to canonical query param format that ResultsScreen expects
  // This maintains compatibility with existing ResultsScreen implementation
  useEffect(() => {
    if (submissionId && router.isReady) {
      router.replace(`/gut-check?submission_id=${submissionId}`, undefined, { shallow: false });
    }
  }, [submissionId, router.isReady, router]);

  return (
    <>
      <Head>
        <title>Your Gut Check Results • Fine Diet</title>
        <meta
          name="description"
          content="View your personalized gut health assessment results."
        />
      </Head>
      <div className="min-h-screen bg-brand-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-dark_accent-500 border-t-transparent mb-4"></div>
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

  return {
    props: {
      submissionId,
    },
  };
};

