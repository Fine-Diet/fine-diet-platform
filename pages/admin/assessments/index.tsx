/**
 * Admin Page: Assessments Index
 * 
 * Unified view linking Questions and Results for each assessment version.
 * Shows all assessment_type/version/locale combinations from both systems.
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface AssessmentVersion {
  assessmentType: string;
  assessmentVersion: string;
  locale: string | null;
  questionSetId: string | null;
  resultsPackIds: {
    level1: string | null;
    level2: string | null;
    level3: string | null;
    level4: string | null;
  };
}

interface AssessmentsIndexProps {
  user: AuthenticatedUser | null;
}

export default function AssessmentsIndex({ user }: AssessmentsIndexProps) {
  const [assessments, setAssessments] = useState<AssessmentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Defensive check for unauthorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Assessments • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Admin</h1>
            <p className="text-lg text-gray-600 mb-8">
              You don't have permission to access this area.
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

  useEffect(() => {
    async function fetchAssessments() {
      try {
        setLoading(true);
        setError(null);

        // Fetch both question sets and results packs
        const [questionSetsRes, resultsPacksRes] = await Promise.all([
          fetch('/api/admin/question-sets'),
          fetch('/api/admin/results-packs'),
        ]);

        if (!questionSetsRes.ok || !resultsPacksRes.ok) {
          throw new Error('Failed to fetch assessment data');
        }

        const questionSetsData = await questionSetsRes.json();
        const resultsPacksData = await resultsPacksRes.json();

        const questionSets = questionSetsData.questionSets || [];
        const resultsPacks = resultsPacksData.resultsPacks || [];

        // Build a map of assessment versions
        const versionMap = new Map<string, AssessmentVersion>();

        // Add question sets
        questionSets.forEach((qs: any) => {
          const key = `${qs.assessmentType}:${qs.assessmentVersion}:${qs.locale || 'null'}`;
          if (!versionMap.has(key)) {
            versionMap.set(key, {
              assessmentType: qs.assessmentType,
              assessmentVersion: qs.assessmentVersion,
              locale: qs.locale,
              questionSetId: qs.id,
              resultsPackIds: {
                level1: null,
                level2: null,
                level3: null,
                level4: null,
              },
            });
          } else {
            versionMap.get(key)!.questionSetId = qs.id;
          }
        });

        // Add results packs
        resultsPacks.forEach((rp: any) => {
          const key = `${rp.assessmentType}:${rp.resultsVersion}:null`;
          if (!versionMap.has(key)) {
            versionMap.set(key, {
              assessmentType: rp.assessmentType,
              assessmentVersion: rp.resultsVersion,
              locale: null,
              questionSetId: null,
              resultsPackIds: {
                level1: null,
                level2: null,
                level3: null,
                level4: null,
              },
            });
          }
          const version = versionMap.get(key)!;
          if (rp.levelId === 'level1') version.resultsPackIds.level1 = rp.id;
          if (rp.levelId === 'level2') version.resultsPackIds.level2 = rp.id;
          if (rp.levelId === 'level3') version.resultsPackIds.level3 = rp.id;
          if (rp.levelId === 'level4') version.resultsPackIds.level4 = rp.id;
        });

        // Convert to array and sort
        const assessmentsArray = Array.from(versionMap.values()).sort((a, b) => {
          if (a.assessmentType !== b.assessmentType) {
            return a.assessmentType.localeCompare(b.assessmentType);
          }
          if (a.assessmentVersion !== b.assessmentVersion) {
            return a.assessmentVersion.localeCompare(b.assessmentVersion);
          }
          return (a.locale || '').localeCompare(b.locale || '');
        });

        setAssessments(assessmentsArray);
      } catch (err) {
        console.error('Error fetching assessments:', err);
        setError(err instanceof Error ? err.message : 'Failed to load assessments');
      } finally {
        setLoading(false);
      }
    }

    fetchAssessments();
  }, []);

  return (
    <>
      <Head>
        <title>Assessments • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Admin Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Assessments</h1>
                <p className="text-lg text-gray-600">
                  Unified view of Questions and Results for each assessment version
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-600">Loading assessments...</p>
            </div>
          )}

          {/* Assessments Table */}
          {!loading && !error && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {assessments.length === 0 ? (
                <div className="p-8 text-center text-gray-600">
                  <p>No assessments found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assessment Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Version
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Locale
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Questions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Results (Levels)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {assessments.map((assessment, idx) => {
                        const hasQuestions = !!assessment.questionSetId;
                        const hasResults = Object.values(assessment.resultsPackIds).some(id => id !== null);
                        const resultsCount = Object.values(assessment.resultsPackIds).filter(id => id !== null).length;

                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {assessment.assessmentType}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {assessment.assessmentVersion}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {assessment.locale || <span className="text-gray-400">default</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {hasQuestions ? (
                                <Link
                                  href={`/admin/question-sets/${assessment.questionSetId}`}
                                  className="text-blue-600 hover:text-blue-900 font-medium"
                                >
                                  Manage Questions
                                </Link>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {hasResults ? (
                                <div className="flex flex-wrap gap-2">
                                  {assessment.resultsPackIds.level1 && (
                                    <Link
                                      href={`/admin/results-packs/${assessment.resultsPackIds.level1}`}
                                      className="text-blue-600 hover:text-blue-900"
                                    >
                                      Level 1
                                    </Link>
                                  )}
                                  {assessment.resultsPackIds.level2 && (
                                    <Link
                                      href={`/admin/results-packs/${assessment.resultsPackIds.level2}`}
                                      className="text-blue-600 hover:text-blue-900"
                                    >
                                      Level 2
                                    </Link>
                                  )}
                                  {assessment.resultsPackIds.level3 && (
                                    <Link
                                      href={`/admin/results-packs/${assessment.resultsPackIds.level3}`}
                                      className="text-blue-600 hover:text-blue-900"
                                    >
                                      Level 3
                                    </Link>
                                  )}
                                  {assessment.resultsPackIds.level4 && (
                                    <Link
                                      href={`/admin/results-packs/${assessment.resultsPackIds.level4}`}
                                      className="text-blue-600 hover:text-blue-900"
                                    >
                                      Level 4
                                    </Link>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AssessmentsIndexProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }
  return { props: { user } };
};

