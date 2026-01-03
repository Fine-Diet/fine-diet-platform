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
import { buildAssessmentIndex, type AssessmentVersion } from '@/lib/admin/assessments/buildAssessmentIndex';

interface AssessmentsIndexProps {
  user: AuthenticatedUser | null;
}

export default function AssessmentsIndex({ user }: AssessmentsIndexProps) {
  const [assessments, setAssessments] = useState<AssessmentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

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

  const fetchAssessments = async () => {
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

      // Use helper function to build assessment index
      const assessmentsArray = buildAssessmentIndex(questionSets, resultsPacks);
      setAssessments(assessmentsArray);
    } catch (err) {
      console.error('Error fetching assessments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

  const handleScaffoldQuestions = async (assessment: AssessmentVersion) => {
    const key = `${assessment.assessmentType}:${assessment.questionsVersion}`;
    setActionLoading((prev) => new Set(prev).add(`questions-${key}`));
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/admin/assessments/scaffold-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentType: assessment.assessmentType,
          assessmentVersion: assessment.questionsVersion, // Use numeric questionsVersion
          locale: assessment.locale,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to scaffold questions');
      }

      const data = await response.json();
      setSuccessMessage(data.created ? 'Questions set created' : 'Questions set already exists');
      await fetchAssessments(); // Refetch to update state
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error scaffolding questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to scaffold questions');
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(`questions-${key}`);
        return next;
      });
    }
  };

  const handleScaffoldResults = async (assessment: AssessmentVersion) => {
    const key = `${assessment.assessmentType}:${assessment.resultsVersion}`;
    setActionLoading((prev) => new Set(prev).add(`results-${key}`));
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/admin/assessments/scaffold-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentType: assessment.assessmentType,
          resultsVersion: assessment.resultsVersion, // Use string resultsVersion
          locale: assessment.locale,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to scaffold results');
      }

      const data = await response.json();
      const createdCount = Object.values(data.created).filter(Boolean).length;
      setSuccessMessage(`Results packs: ${createdCount} created, ${4 - createdCount} already existed`);
      await fetchAssessments(); // Refetch to update state with new pack IDs
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error scaffolding results:', err);
      setError(err instanceof Error ? err.message : 'Failed to scaffold results');
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(`results-${key}`);
        return next;
      });
    }
  };

  const handleScaffoldDrafts = async (assessment: AssessmentVersion) => {
    const key = `${assessment.assessmentType}:${assessment.questionsVersion}`;
    setActionLoading((prev) => new Set(prev).add(`drafts-${key}`));
    setError(null);
    setSuccessMessage(null);

    try {
      // Only include pack IDs that exist
      const resultsPackIds: any = {};
      if (assessment.resultsPackIds.level1) resultsPackIds.level1 = assessment.resultsPackIds.level1;
      if (assessment.resultsPackIds.level2) resultsPackIds.level2 = assessment.resultsPackIds.level2;
      if (assessment.resultsPackIds.level3) resultsPackIds.level3 = assessment.resultsPackIds.level3;
      if (assessment.resultsPackIds.level4) resultsPackIds.level4 = assessment.resultsPackIds.level4;

      const response = await fetch('/api/admin/assessments/scaffold-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionSetId: assessment.questionSetId || undefined,
          resultsPackIds: Object.keys(resultsPackIds).length > 0 ? resultsPackIds : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to scaffold drafts');
      }

      const data = await response.json();
      const created: string[] = [];
      const skipped: string[] = [];
      
      if (data.created.questionDraft) {
        created.push('questions');
      } else if (data.skipped.questionSet) {
        skipped.push('questions');
      }
      
      if (data.created.resultsDrafts) {
        const resultsCreated = Object.keys(data.created.resultsDrafts).length;
        if (resultsCreated > 0) {
          created.push(`${resultsCreated} results packs`);
        }
      }
      
      if (data.skipped.resultsPacks && data.skipped.resultsPacks.length > 0) {
        skipped.push(`${data.skipped.resultsPacks.length} results packs`);
      }

      let message = '';
      if (created.length > 0 && skipped.length > 0) {
        message = `Drafts created: ${created.join(', ')}. Skipped: ${skipped.join(', ')}`;
      } else if (created.length > 0) {
        message = `Drafts created: ${created.join(', ')}`;
      } else if (skipped.length > 0) {
        message = `All drafts already exist (skipped: ${skipped.join(', ')})`;
      } else {
        message = 'All drafts already exist';
      }
      
      setSuccessMessage(message);
      await fetchAssessments(); // Refetch to update state
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error scaffolding drafts:', err);
      setError(err instanceof Error ? err.message : 'Failed to scaffold drafts');
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(`drafts-${key}`);
        return next;
      });
    }
  };

  const handleScaffoldAll = async () => {
    if (!confirm('Create missing identities and drafts for all assessments? This may take a moment.')) {
      return;
    }

    setBulkProgress({ current: 0, total: assessments.length });
    setError(null);
    setSuccessMessage(null);

    try {
      for (let i = 0; i < assessments.length; i++) {
        const assessment = assessments[i];
        setBulkProgress({ current: i + 1, total: assessments.length });

        // Scaffold questions if missing
        if (!assessment.questionSetId) {
          const qResponse = await fetch('/api/admin/assessments/scaffold-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assessmentType: assessment.assessmentType,
              assessmentVersion: assessment.questionsVersion, // Use numeric questionsVersion
              locale: assessment.locale,
            }),
          });
          if (!qResponse.ok) {
            const data = await qResponse.json();
            throw new Error(`Failed to scaffold questions for ${assessment.assessmentType} v${assessment.questionsVersion}: ${data.error}`);
          }
        }

        // Scaffold results if any missing
        const missingResults = Object.values(assessment.resultsPackIds).some(id => id === null);
        if (missingResults) {
          const rResponse = await fetch('/api/admin/assessments/scaffold-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assessmentType: assessment.assessmentType,
              resultsVersion: assessment.resultsVersion, // Use string resultsVersion
              locale: assessment.locale,
            }),
          });
          if (!rResponse.ok) {
            const data = await rResponse.json();
            throw new Error(`Failed to scaffold results for ${assessment.assessmentType} v${assessment.resultsVersion}: ${data.error}`);
          }
        }
      }

      setSuccessMessage('All missing identities created successfully');
      setBulkProgress(null);
      await fetchAssessments();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error in bulk scaffold:', err);
      setError(err instanceof Error ? err.message : 'Bulk scaffold failed');
      setBulkProgress(null);
    }
  };

  return (
    <>
      <Head>
        <title>Assessments • Fine Diet Admin</title>
      </Head>
      <div className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
              {assessments.length > 0 && (
                <button
                  onClick={handleScaffoldAll}
                  disabled={!!bulkProgress || actionLoading.size > 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkProgress ? `Creating... ${bulkProgress.current}/${bulkProgress.total}` : 'Create Missing For All'}
                </button>
              )}
            </div>
          </div>

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <Link
              href="/admin/question-sets"
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 transition-all"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Question Sets</h2>
              <p className="text-sm text-gray-600">
                Manage assessment question sets, revisions, preview, and publish.
              </p>
            </Link>

            <Link
              href="/admin/results-packs"
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 transition-all"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Results Packs</h2>
              <p className="text-sm text-gray-600">
                Manage assessment results packs, revisions, preview, and publish.
              </p>
            </Link>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Assessment Config</h2>
              <div className="space-y-2">
                <Link
                  href="/admin/config/assessments/gut-check-v1"
                  className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Gut Check v1 Config
                </Link>
                <Link
                  href="/admin/config/assessments/gut-check-v2"
                  className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Gut Check v2 Config
                </Link>
                <Link
                  href="/admin/config/feature-flags"
                  className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Feature Flags
                </Link>
                <Link
                  href="/admin/config/avatar-mapping"
                  className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Avatar Mapping
                </Link>
              </div>
            </div>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}

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
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {assessments.map((assessment, idx) => {
                        const hasQuestions = !!assessment.questionSetId;
                        const resultsCount = Object.values(assessment.resultsPackIds).filter(id => id !== null).length;
                        const missingResults = resultsCount < 4;
                        const hasAllResults = resultsCount === 4;
                        const questionsKey = `${assessment.assessmentType}:${assessment.questionsVersion}`;
                        const resultsKey = `${assessment.assessmentType}:${assessment.resultsVersion}`;
                        const isLoading = actionLoading.has(`questions-${questionsKey}`) || 
                                         actionLoading.has(`results-${resultsKey}`) || 
                                         actionLoading.has(`drafts-${questionsKey}`) ||
                                         !!bulkProgress;

                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {assessment.assessmentType}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              Q:{assessment.questionsVersion} / R:{assessment.resultsVersion}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {assessment.locale || <span className="text-gray-400">default</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {hasQuestions ? (
                                <>
                                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded mr-2">
                                    Present
                                  </span>
                                  <Link
                                    href={`/admin/question-sets/${assessment.questionSetId}`}
                                    className="text-blue-600 hover:text-blue-900 font-medium"
                                  >
                                    Manage
                                  </Link>
                                </>
                              ) : (
                                <>
                                  <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded mr-2">
                                    Missing
                                  </span>
                                  <button
                                    onClick={() => handleScaffoldQuestions(assessment)}
                                    disabled={isLoading}
                                    className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                                  >
                                    Create
                                  </button>
                                </>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {resultsCount > 0 ? (
                                <>
                                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded mr-2">
                                    {resultsCount}/4
                                  </span>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {assessment.resultsPackIds.level1 && (
                                      <Link
                                        href={`/admin/results-packs/${assessment.resultsPackIds.level1}`}
                                        className="text-blue-600 hover:text-blue-900 text-xs"
                                      >
                                        L1
                                      </Link>
                                    )}
                                    {assessment.resultsPackIds.level2 && (
                                      <Link
                                        href={`/admin/results-packs/${assessment.resultsPackIds.level2}`}
                                        className="text-blue-600 hover:text-blue-900 text-xs"
                                      >
                                        L2
                                      </Link>
                                    )}
                                    {assessment.resultsPackIds.level3 && (
                                      <Link
                                        href={`/admin/results-packs/${assessment.resultsPackIds.level3}`}
                                        className="text-blue-600 hover:text-blue-900 text-xs"
                                      >
                                        L3
                                      </Link>
                                    )}
                                    {assessment.resultsPackIds.level4 && (
                                      <Link
                                        href={`/admin/results-packs/${assessment.resultsPackIds.level4}`}
                                        className="text-blue-600 hover:text-blue-900 text-xs"
                                      >
                                        L4
                                      </Link>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                                  0/4 Missing
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                              {!hasQuestions && (
                                <button
                                  onClick={() => handleScaffoldQuestions(assessment)}
                                  disabled={isLoading}
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Create Questions
                                </button>
                              )}
                              {missingResults && (
                                <button
                                  onClick={() => handleScaffoldResults(assessment)}
                                  disabled={isLoading}
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Create Results
                                </button>
                              )}
                              {(hasQuestions || resultsCount > 0) && (
                                <button
                                  onClick={() => handleScaffoldDrafts(assessment)}
                                  disabled={isLoading || (!hasQuestions && !hasAllResults)}
                                  className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={!hasQuestions && !hasAllResults ? 'Create Questions and Results first' : 'Create starter draft revisions'}
                                >
                                  Create Drafts
                                </button>
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


