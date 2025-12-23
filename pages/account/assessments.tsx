/**
 * My Assessments Page
 * 
 * Route: /account/assessments
 * 
 * Lists all assessment submissions for the authenticated user.
 */

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import Link from 'next/link';

interface AssessmentSubmission {
  id: string;
  assessment_type: string;
  assessment_version: number;
  primary_avatar: string;
  created_at: string;
}

interface AssessmentsPageProps {
  user: {
    id: string;
    email: string | null;
  };
}

export default function AssessmentsPage({ user }: AssessmentsPageProps) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSubmissions() {
      try {
        const response = await fetch('/api/account/assessments');
        if (!response.ok) {
          throw new Error('Failed to load assessments');
        }
        const data = await response.json();
        setSubmissions(data.submissions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assessments');
      } finally {
        setLoading(false);
      }
    }

    fetchSubmissions();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getAssessmentTypeLabel = (type: string) => {
    if (type === 'gut-check') return 'Gut Check';
    return type;
  };

  const getLevelLabel = (avatar: string) => {
    // Normalize level1-4 format
    if (avatar.startsWith('level')) {
      return avatar.charAt(5).toUpperCase() + avatar.slice(6);
    }
    return avatar;
  };

  return (
    <>
      <Head>
        <title>My Assessments • Fine Diet</title>
        <meta
          name="description"
          content="View your assessment results and history."
        />
      </Head>
      <div className="min-h-screen bg-brand-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-8 antialiased">
            My Assessments
          </h1>

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-dark_accent-500 border-t-transparent mb-4"></div>
              <p className="text-white text-lg">Loading assessments...</p>
            </div>
          )}

          {error && (
            <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-4 mb-6">
              <p className="text-white antialiased">{error}</p>
            </div>
          )}

          {!loading && !error && submissions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-neutral-300 text-lg mb-6 antialiased">
                You haven't completed any assessments yet.
              </p>
              <Link
                href="/gut-check"
                className="inline-block bg-dark_accent-500 hover:bg-dark_accent-600 text-neutral-900 font-semibold px-6 py-3 rounded-full transition-colors antialiased"
              >
                Take Gut Check Assessment
              </Link>
            </div>
          )}

          {!loading && !error && submissions.length > 0 && (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-6 hover:border-neutral-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-white mb-2 antialiased">
                        {getAssessmentTypeLabel(submission.assessment_type)}
                      </h2>
                      <p className="text-neutral-300 text-sm mb-3 antialiased">
                        Completed on {formatDate(submission.created_at)}
                      </p>
                      <p className="text-neutral-400 text-sm antialiased">
                        Level: {getLevelLabel(submission.primary_avatar)}
                      </p>
                    </div>
                    <Link
                      href={`/results/${submission.id}`}
                      className="ml-4 bg-dark_accent-500 hover:bg-dark_accent-600 text-neutral-900 font-semibold px-4 py-2 rounded-full transition-colors antialiased whitespace-nowrap"
                    >
                      View Results
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AssessmentsPageProps> = async (context) => {
  // Require authentication
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/account/assessments',
        permanent: false,
      },
    };
  }

  return {
    props: {
      user: {
        id: user.id,
        email: user.email,
      },
    },
  };
};

