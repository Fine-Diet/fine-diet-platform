/**
 * Admin Page: Direct Question-Set Authoring (JSON)
 *
 * Route: /admin/question-sets/author
 *
 * Minimal, reliable editor that lets an editor/admin author a QuestionSet as
 * structured JSON — no CSV required. The page can load the current
 * published/preview revision for an existing identity, edit the JSON inline,
 * validate, save an immutable draft revision, and optionally set the preview
 * pointer. Publishing remains on the per-question-set Manage page (admin only)
 * via the existing /api/admin/question-set-pointers/publish endpoint.
 *
 * Persistence goes through /api/admin/question-sets/save-json, which shares its
 * save path with the CSV importer so both produce identical revision records.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface AuthorPageProps {
  user: AuthenticatedUser | null;
}

const STARTER_TEMPLATE = `{
  "version": "2",
  "assessmentType": "gut-check",
  "sections": [
    { "id": "s1", "title": "Section 1", "questionIds": ["q1"] }
  ],
  "questions": [
    {
      "id": "q1",
      "text": "How often do you experience bloating?",
      "options": [
        { "id": "o1", "label": "Rarely or never", "value": 0 },
        { "id": "o2", "label": "Occasionally", "value": 1 },
        { "id": "o3", "label": "Frequently", "value": 2 },
        { "id": "o4", "label": "Almost daily", "value": 3 }
      ]
    }
  ]
}`;

interface SaveSuccessResult {
  kind: 'created' | 'duplicate';
  questionSetId: string;
  revisionId: string;
  revisionNumber: number;
  contentHash: string;
  previewUrl: string;
  manageUrl: string;
}

interface SaveValidationResult {
  kind: 'validation';
  errors: string[];
  warnings: string[];
}

type SaveResult = SaveSuccessResult | SaveValidationResult | { kind: 'error'; error: string };

export default function QuestionSetAuthorPage({ user }: AuthorPageProps) {
  const [assessmentType, setAssessmentType] = useState('gut-check');
  const [assessmentVersion, setAssessmentVersion] = useState('3');
  const [locale, setLocale] = useState('');
  const [notes, setNotes] = useState('');
  const [jsonText, setJsonText] = useState(STARTER_TEMPLATE);
  const [setPreview, setSetPreview] = useState(false);

  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Author Question Set • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Admin</h1>
            <p className="text-lg text-gray-600 mb-8">You don't have permission to access this area.</p>
            <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium">
              Return to Home
            </Link>
          </div>
        </main>
      </>
    );
  }

  const handleLoadExisting = async () => {
    setError(null);
    setResult(null);
    if (!assessmentType.trim() || !assessmentVersion.trim()) {
      setError('Assessment Type and Version are required to load existing content.');
      return;
    }
    setLoadingExisting(true);
    try {
      const params = new URLSearchParams({
        assessmentType: assessmentType.trim(),
        assessmentVersion: assessmentVersion.trim(),
        preview: '1',
      });
      if (locale.trim()) params.set('locale', locale.trim());

      const response = await fetch(`/api/question-sets/resolve?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load existing question set');
      }
      if (!data.questionSet) {
        throw new Error('No published or preview revision found for that identity. Use the starter template to author a new one.');
      }
      setJsonText(JSON.stringify(data.questionSet, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load existing question set');
    } finally {
      setLoadingExisting(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setError(err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON');
      return;
    }

    if (!assessmentVersion.trim()) {
      setError('Version is required.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/question-sets/save-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionSet: parsed,
          assessmentType: assessmentType.trim() || undefined,
          assessmentVersion: assessmentVersion.trim(),
          locale: locale.trim() || null,
          notes: notes.trim() || null,
          setPreview,
        }),
      });

      const data = await response.json();

      if (response.status === 400 && data?.kind === 'validation') {
        setResult({ kind: 'validation', errors: data.errors || [], warnings: data.warnings || [] });
        return;
      }
      if (!response.ok && response.status !== 409) {
        throw new Error(data?.error || 'Save failed');
      }

      setResult({
        kind: data.kind === 'duplicate' ? 'duplicate' : 'created',
        questionSetId: data.questionSetId,
        revisionId: data.revisionId,
        revisionNumber: data.revisionNumber,
        contentHash: data.contentHash,
        previewUrl: data.previewUrl,
        manageUrl: data.manageUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Author Question Set • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link href="/admin/question-sets" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">
            ← Back to Question Sets
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Author Question Set</h1>
          <p className="text-lg text-gray-600 mb-8">
            Edit the structured JSON directly. Saves an immutable draft revision; optionally set it as the preview. Publish from the Manage page.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {result?.kind === 'validation' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-semibold text-red-800 mb-2">Validation errors:</p>
              <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              {result.warnings.length > 0 && (
                <p className="text-sm text-red-700 mt-2">Warnings: {result.warnings.join(' ')}</p>
              )}
            </div>
          )}

          {(result?.kind === 'created' || result?.kind === 'duplicate') && (
            <div className={`border rounded-lg p-4 mb-6 ${result.kind === 'duplicate' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-sm font-semibold text-gray-900 mb-1">
                {result.kind === 'duplicate' ? 'No changes — duplicate content' : 'Draft saved'}
              </p>
              <p className="text-sm text-gray-700">
                Revision #{result.revisionNumber} · {result.contentHash.slice(0, 12)}…
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link href={result.manageUrl} className="text-blue-600 hover:text-blue-800 underline">Manage revisions</Link>
                <a href={result.previewUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 underline">Preview API (JSON)</a>
                <Link href={`/admin/question-sets/preview/${result.questionSetId}?revisionId=${result.revisionId}`} className="text-blue-600 hover:text-blue-800 underline">Formatted preview</Link>
              </div>
            </div>
          )}

          {/* Identity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Identity</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Assessment Type</span>
                <input
                  value={assessmentType}
                  onChange={(e) => setAssessmentType(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="gut-check"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Version</span>
                <input
                  value={assessmentVersion}
                  onChange={(e) => setAssessmentVersion(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="3"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Locale (optional)</span>
                <input
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="default (blank)"
                />
              </label>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={handleLoadExisting}
                disabled={loadingExisting}
                className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:bg-gray-400 text-sm font-medium"
              >
                {loadingExisting ? 'Loading…' : 'Load existing (preview/published)'}
              </button>
            </div>
          </div>

          {/* JSON editor */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Question Set JSON</h2>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              className="w-full h-[480px] font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <p className="mt-2 text-xs text-gray-500">
              v2 schema: <code>version: &quot;2&quot;</code>, <code>assessmentType: &quot;gut-check&quot;</code>, non-empty <code>sections</code> and <code>questions</code>, each question has exactly 4 options with values 0,1,2,3.
            </p>
          </div>

          {/* Save options */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Save</h2>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Notes (optional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                placeholder="What changed in this draft?"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={setPreview}
                onChange={(e) => setSetPreview(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span>Set this revision as the preview pointer after saving</span>
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">JSON contract</h2>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li><code>version</code> must be <code>&quot;2&quot;</code>.</li>
              <li><code>assessmentType</code> must be <code>&quot;gut-check&quot;</code> (the only registered assessment today).</li>
              <li><code>sections[]</code>: each has <code>id</code>, <code>title</code>, and non-empty <code>questionIds[]</code> referencing real questions.</li>
              <li><code>questions[]</code>: each has <code>id</code>, <code>text</code>, and exactly 4 <code>options</code>.</li>
              <li>Each option has <code>id</code>, <code>label</code>, and <code>value</code> ∈ {'{0,1,2,3}'}; all four values must appear once per question.</li>
              <li>Invalid JSON is rejected with actionable validation errors; duplicate content returns the existing revision without creating a new one.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AuthorPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }
  return { props: { user } };
};
