/**
 * Admin Page: Question Set Preview
 * 
 * Shows a formatted, readable preview of a question set.
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { useRouter } from 'next/router';

interface PreviewPageProps {
  user: AuthenticatedUser | null;
  questionSetId: string;
}

interface QuestionSetData {
  version: string;
  assessmentType: string;
  sections?: Array<{
    id: string;
    title: string;
    questionIds: string[];
  }>;
  questions: Array<{
    id: string;
    text: string;
    options: Array<{
      id: string;
      label: string;
      value: number;
    }>;
  }>;
}

export default function QuestionSetPreviewPage({ user, questionSetId }: PreviewPageProps) {
  const router = useRouter();
  const { revisionId } = router.query;
  const [questionSet, setQuestionSet] = useState<QuestionSetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessmentType, setAssessmentType] = useState<string>('');
  const [assessmentVersion, setAssessmentVersion] = useState<string>('');
  const [locale, setLocale] = useState<string | null>(null);

  // Defensive check for unauthorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Question Set Preview • Fine Diet Admin</title>
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
    async function loadPreview() {
      try {
        setLoading(true);
        setError(null);
        setIsEmptyState(false);

        // First, get the question set details to get assessmentType/version/locale
        const detailResponse = await fetch(`/api/admin/question-sets/${questionSetId}`);
        if (!detailResponse.ok) {
          throw new Error('Failed to fetch question set details');
        }

        const detailData = await detailResponse.json();
        setAssessmentType(detailData.questionSet.assessmentType);
        setAssessmentVersion(detailData.questionSet.assessmentVersion);
        setLocale(detailData.questionSet.locale);

        // Build query params for question set resolve
        const params = new URLSearchParams({
          assessmentType: detailData.questionSet.assessmentType,
          assessmentVersion: detailData.questionSet.assessmentVersion,
        });
        if (detailData.questionSet.locale) {
          params.set('locale', detailData.questionSet.locale);
        }
        params.set('preview', '1');

        // If revisionId is provided, we need to fetch that specific revision
        // Otherwise, the resolve API will use the preview pointer
        if (revisionId && typeof revisionId === 'string') {
          // For now, we'll still use the resolve API which should handle preview
          // If we need to fetch a specific revision, we'd need a new endpoint
        }

        // Fetch the question set content
        const resolveResponse = await fetch(`/api/question-sets/resolve?${params.toString()}`);
        if (!resolveResponse.ok) {
          const errorData = await resolveResponse.json();
          const errorMessage = errorData.error || 'Failed to fetch question set';
          
          // Provide more context if it's a file fallback error
          if (errorMessage.includes('Failed to load question set from file')) {
            throw new Error(
              `Question set not found in CMS for ${detailData.questionSet.assessmentType} v${detailData.questionSet.assessmentVersion}. ` +
              `File fallback also failed. Please ensure the question set is published in the CMS.`
            );
          }
          
          throw new Error(errorMessage);
        }

        const resolveData = await resolveResponse.json();
        
        // Handle cms_empty case (question set exists but no pointers set)
        if (resolveData.source === 'cms_empty') {
          setError(null); // Clear any previous errors
          setQuestionSet(null); // No question set to display
          setIsEmptyState(true); // Show empty state UI
          return; // Exit early, we'll handle rendering below
        }
        
        // The API returns { questionSet: {...} }
        if (resolveData.questionSet) {
          // Log source for debugging
          if (process.env.NODE_ENV === 'development') {
            console.log('[QuestionSetPreview] Resolved from:', resolveData.source, {
              questionSetId: resolveData.questionSetId,
              revisionId: resolveData.revisionId,
              isPreview: resolveData.isPreview,
            });
          }
          setQuestionSet(resolveData.questionSet);
          setIsEmptyState(false); // Clear empty state
        } else {
          throw new Error('Invalid response format from API');
        }
      } catch (err) {
        console.error('Error loading preview:', err);
        setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        setLoading(false);
      }
    }

    if (questionSetId) {
      loadPreview();
    }
  }, [questionSetId, revisionId]);

  // Helper to get questions by section
  const getQuestionsBySection = () => {
    if (!questionSet) return [];

    if (questionSet.sections && questionSet.sections.length > 0) {
      // Group questions by section
      return questionSet.sections.map((section) => {
        const sectionQuestions = section.questionIds
          .map((qId) => questionSet.questions.find((q) => q.id === qId))
          .filter((q): q is NonNullable<typeof q> => q !== undefined);

        return {
          section,
          questions: sectionQuestions,
        };
      });
    } else {
      // No sections - show all questions in a single group
      return [
        {
          section: { id: 'all', title: 'All Questions', questionIds: questionSet.questions.map((q) => q.id) },
          questions: questionSet.questions,
        },
      ];
    }
  };

  return (
    <>
      <Head>
        <title>Question Set Preview • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href={`/admin/question-sets/${questionSetId}`}
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Question Set
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Question Set Preview</h1>
            <p className="text-lg text-gray-600">
              {assessmentType && assessmentVersion && (
                <>
                  {assessmentType} v{assessmentVersion}
                  {locale && ` (${locale})`}
                </>
              )}
            </p>
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
              <p className="text-gray-600">Loading preview...</p>
            </div>
          )}

          {/* Empty State - Question Set Exists But No Published/Preview Revision */}
          {!loading && !error && isEmptyState && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
                  <svg
                    className="h-6 w-6 text-yellow-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  No Published or Preview Revision
                </h2>
                <p className="text-gray-600 mb-6">
                  This question set exists in the CMS but doesn't have a published or preview revision set.
                  Please publish a revision or set a preview revision to view it here.
                </p>
                <Link
                  href={`/admin/question-sets/${questionSetId}`}
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Go to Question Set Management
                </Link>
              </div>
            </div>
          )}

          {/* Preview Content */}
          {!loading && !error && !isEmptyState && questionSet && (
            <div className="space-y-8">
              {/* Metadata */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Metadata</h2>
                <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Version</dt>
                    <dd className="mt-1 text-sm text-gray-900">{questionSet.version}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Assessment Type</dt>
                    <dd className="mt-1 text-sm text-gray-900">{questionSet.assessmentType}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Total Questions</dt>
                    <dd className="mt-1 text-sm text-gray-900">{questionSet.questions.length}</dd>
                  </div>
                </dl>
              </div>

              {/* Questions by Section */}
              {getQuestionsBySection().map(({ section, questions }) => (
                <div key={section.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  {/* Section Header */}
                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {questions.length} {questions.length === 1 ? 'question' : 'questions'}
                    </p>
                  </div>

                  {/* Questions */}
                  <div className="divide-y divide-gray-200">
                    {questions.map((question, qIndex) => (
                      <div key={question.id} className="p-6">
                        <div className="flex items-start">
                          <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-medium text-sm mr-4">
                            {qIndex + 1}
                          </span>
                          <div className="flex-1">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">{question.text}</h3>
                            <div className="space-y-2">
                              {question.options
                                .sort((a, b) => a.value - b.value)
                                .map((option) => (
                                  <div
                                    key={option.id}
                                    className="flex items-center p-3 bg-gray-50 rounded-md border border-gray-200"
                                  >
                                    <span className="flex-shrink-0 w-8 text-sm font-medium text-gray-500 text-right mr-4">
                                      {option.value}
                                    </span>
                                    <span className="text-sm text-gray-900">{option.label}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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

export const getServerSideProps: GetServerSideProps<PreviewPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, questionSetId: '' } };
  }

  const questionSetId = context.params?.questionSetId;
  if (!questionSetId || typeof questionSetId !== 'string') {
    return {
      notFound: true,
    };
  }

  return { props: { user, questionSetId } };
};

