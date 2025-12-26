/**
 * Admin Page: Import Question Sets from CSV
 * 
 * POST /admin/question-sets/import
 * 
 * Allows editor/admin users to upload CSV files and create draft question set revisions.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface ImportPageProps {
  user: AuthenticatedUser | null;
}

interface ImportError {
  file: string;
  row: number;
  column?: string;
  message: string;
}

interface ImportSuccess {
  ok: true;
  questionSetId: string;
  revisionId: string;
  revisionNumber: number;
  previewUrl: string;
}

interface ImportFailure {
  ok: false;
  errors: ImportError[];
}

type ImportResponse = ImportSuccess | ImportFailure;

export default function QuestionSetImport({ user }: ImportPageProps) {
  const [metaFile, setMetaFile] = useState<File | null>(null);
  const [sectionsFile, setSectionsFile] = useState<File | null>(null);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [optionsFile, setOptionsFile] = useState<File | null>(null);
  
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Defensive check - middleware should have already blocked non-authorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Import Question Sets • Fine Diet Admin</title>
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!metaFile || !sectionsFile || !questionsFile || !optionsFile) {
      setError('Please select all four CSV files');
      return;
    }

    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('meta', metaFile);
      formData.append('sections', sectionsFile);
      formData.append('questions', questionsFile);
      formData.append('options', optionsFile);

      const response = await fetch('/api/admin/question-sets/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data: ImportResponse = await response.json();

      if (!response.ok) {
        // If response is not ok but data has errors, still set result
        if (!data.ok && Array.isArray(data.errors)) {
          setResult(data);
        } else {
          setError(data.ok === false ? 'Import failed' : 'Unknown error occurred');
        }
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload files');
    } finally {
      setSubmitting(false);
    }
  };

  // Sort errors by file, then row, then column
  const sortedErrors = result && !result.ok && Array.isArray(result.errors)
    ? [...result.errors].sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        if (a.row !== b.row) return a.row - b.row;
        return (a.column || '').localeCompare(b.column || '');
      })
    : [];

  return (
    <>
      <Head>
        <title>Import Question Sets • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Admin Dashboard
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Import Question Sets (CSV)</h1>
            <p className="text-lg text-gray-600">
              Upload CSV files to create a draft question set revision.
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Before Uploading</h2>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
              <li>Files must be named: <code className="bg-blue-100 px-1 rounded">meta.csv</code>, <code className="bg-blue-100 px-1 rounded">sections.csv</code>, <code className="bg-blue-100 px-1 rounded">questions.csv</code>, <code className="bg-blue-100 px-1 rounded">options.csv</code></li>
              <li>Export each tab separately from your Google Sheet</li>
              <li>Ensure all required columns are present</li>
            </ul>
          </div>

          {/* Upload Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {/* Meta File */}
                <div>
                  <label htmlFor="meta" className="block text-sm font-medium text-gray-700 mb-2">
                    meta.csv <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    id="meta"
                    accept=".csv"
                    required
                    onChange={(e) => setMetaFile(e.target.files?.[0] || null)}
                    disabled={submitting}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {metaFile && (
                    <p className="mt-1 text-sm text-gray-600">Selected: {metaFile.name}</p>
                  )}
                </div>

                {/* Sections File */}
                <div>
                  <label htmlFor="sections" className="block text-sm font-medium text-gray-700 mb-2">
                    sections.csv <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    id="sections"
                    accept=".csv"
                    required
                    onChange={(e) => setSectionsFile(e.target.files?.[0] || null)}
                    disabled={submitting}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {sectionsFile && (
                    <p className="mt-1 text-sm text-gray-600">Selected: {sectionsFile.name}</p>
                  )}
                </div>

                {/* Questions File */}
                <div>
                  <label htmlFor="questions" className="block text-sm font-medium text-gray-700 mb-2">
                    questions.csv <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    id="questions"
                    accept=".csv"
                    required
                    onChange={(e) => setQuestionsFile(e.target.files?.[0] || null)}
                    disabled={submitting}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {questionsFile && (
                    <p className="mt-1 text-sm text-gray-600">Selected: {questionsFile.name}</p>
                  )}
                </div>

                {/* Options File */}
                <div>
                  <label htmlFor="options" className="block text-sm font-medium text-gray-700 mb-2">
                    options.csv <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    id="options"
                    accept=".csv"
                    required
                    onChange={(e) => setOptionsFile(e.target.files?.[0] || null)}
                    disabled={submitting}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {optionsFile && (
                    <p className="mt-1 text-sm text-gray-600">Selected: {optionsFile.name}</p>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="mt-8">
                <button
                  type="submit"
                  disabled={submitting || !metaFile || !sectionsFile || !questionsFile || !optionsFile}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {submitting ? 'Uploading...' : 'Upload and Import'}
                </button>
              </div>
            </form>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {result && result.ok && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-green-900 mb-4">✅ Import Successful</h2>
              <div className="space-y-2 text-sm text-green-800">
                <p>
                  <span className="font-medium">Revision Number:</span> {result.revisionNumber}
                </p>
                <p>
                  <span className="font-medium">Revision ID:</span>{' '}
                  <code className="bg-green-100 px-1 rounded text-xs">{result.revisionId}</code>
                </p>
                <p>
                  <span className="font-medium">Question Set ID:</span>{' '}
                  <code className="bg-green-100 px-1 rounded text-xs">{result.questionSetId}</code>
                </p>
                <p className="mt-4">
                  <span className="font-medium">Preview URL:</span>{' '}
                  <a
                    href={result.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    {result.previewUrl}
                  </a>
                </p>
              </div>
              <p className="mt-4 text-sm text-green-700 italic">
                Admin can publish from publish screen (coming next).
              </p>
            </div>
          )}

          {/* Error Table */}
          {result && !result.ok && sortedErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-red-900 mb-4">❌ Import Failed</h2>
              <p className="text-sm text-red-800 mb-4">
                Please fix the following errors and try again:
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-red-200">
                      <th className="text-left py-2 px-3 font-medium text-red-900">File</th>
                      <th className="text-right py-2 px-3 font-medium text-red-900">Row</th>
                      <th className="text-left py-2 px-3 font-medium text-red-900">Column</th>
                      <th className="text-left py-2 px-3 font-medium text-red-900">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedErrors.map((err, idx) => (
                      <tr key={idx} className="border-b border-red-100">
                        <td className="py-2 px-3 text-red-800 font-mono text-xs">
                          {err.file}
                        </td>
                        <td className="py-2 px-3 text-right text-red-800">{err.row}</td>
                        <td className="py-2 px-3 text-red-800">
                          {err.column ? (
                            <code className="bg-red-100 px-1 rounded text-xs">{err.column}</code>
                          ) : (
                            <span className="text-red-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-red-800">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ImportPageProps> = async (context) => {
  // Get the current user with their role
  const user = await getCurrentUserWithRoleFromSSR(context);

  // Note: Middleware should have already blocked non-authorized users,
  // but we still check here for defensive programming
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    // Return user as null - component will show "no access" message
    return {
      props: {
        user: null,
      },
    };
  }

  return {
    props: {
      user,
    },
  };
};

