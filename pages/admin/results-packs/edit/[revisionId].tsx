/**
 * Admin Page: Edit Results Pack Revision
 * 
 * Form-based editor for results pack content.
 * Creates a new draft revision on save (immutable revisions).
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';

interface EditPageProps {
  user: AuthenticatedUser | null;
  revisionId: string;
}

export default function ResultsPackEditPage({ user, revisionId }: EditPageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [packId, setPackId] = useState<string>('');
  const [packInfo, setPackInfo] = useState<{ assessmentType: string; resultsVersion: string; levelId: string } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<ResultsPack>({
    label: '',
    summary: '',
    keyPatterns: [],
    firstFocusAreas: [],
    methodPositioning: '',
  });
  const [changeSummary, setChangeSummary] = useState('');

  // Defensive check for unauthorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Edit Results Pack • Fine Diet Admin</title>
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
    async function loadRevision() {
      try {
        setLoading(true);
        setError(null);

        // Fetch revision content
        const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
        const { data: rev, error: revError } = await supabaseAdmin
          .from('results_pack_revisions')
          .select('id, pack_id, content_json')
          .eq('id', revisionId)
          .single();

        if (revError || !rev) {
          // If revision not found, try to get pack info from packId (if revisionId is actually packId)
          const { data: pack, error: packError } = await supabaseAdmin
            .from('results_packs')
            .select('id, assessment_type, results_version, level_id')
            .eq('id', revisionId)
            .single();

          if (packError || !pack) {
            throw new Error('Revision or pack not found');
          }

          // New revision - get pack info
          setPackId(pack.id);
          setPackInfo({
            assessmentType: pack.assessment_type,
            resultsVersion: pack.results_version,
            levelId: pack.level_id,
          });
          // Use empty form data (will be populated with defaults)
        } else {
          // Existing revision - load content
          setPackId(rev.pack_id);
          const packContent = rev.content_json as ResultsPack;
          setFormData(packContent);

          // Get pack info
          const { data: pack, error: packError } = await supabaseAdmin
            .from('results_packs')
            .select('assessment_type, results_version, level_id')
            .eq('id', rev.pack_id)
            .single();

          if (!packError && pack) {
            setPackInfo({
              assessmentType: pack.assessment_type,
              resultsVersion: pack.results_version,
              levelId: pack.level_id,
            });
          }
        }
      } catch (err) {
        console.error('Error loading revision:', err);
        setError(err instanceof Error ? err.message : 'Failed to load revision');
      } finally {
        setLoading(false);
      }
    }

    if (revisionId) {
      loadRevision();
    }
  }, [revisionId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setValidationErrors([]);

    try {
      const response = await fetch(`/api/admin/results-packs/${packId}/revisions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_json: formData,
          change_summary: changeSummary || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.validation && !data.validation.ok) {
          setValidationErrors(data.validation.errors || []);
          setError('Validation failed. Please fix the errors below.');
        } else {
          throw new Error(data.error || 'Failed to save revision');
        }
        return;
      }

      const data = await response.json();
      // Redirect to manage page
      router.push(`/admin/results-packs/${packId}`);
    } catch (err) {
      console.error('Error saving revision:', err);
      setError(err instanceof Error ? err.message : 'Failed to save revision');
    } finally {
      setSaving(false);
    }
  };

  const updateArrayField = (field: 'keyPatterns' | 'firstFocusAreas', index: number, value: string) => {
    const newArray = [...formData[field]];
    newArray[index] = value;
    setFormData({ ...formData, [field]: newArray });
  };

  const addArrayItem = (field: 'keyPatterns' | 'firstFocusAreas') => {
    setFormData({ ...formData, [field]: [...formData[field], ''] });
  };

  const removeArrayItem = (field: 'keyPatterns' | 'firstFocusAreas', index: number) => {
    const newArray = formData[field].filter((_, i) => i !== index);
    setFormData({ ...formData, [field]: newArray });
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Edit Results Pack • Fine Diet Admin</title>
        </Head>
        <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-600">Loading revision...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error && !packId) {
    return (
      <>
        <Head>
          <title>Edit Results Pack • Fine Diet Admin</title>
        </Head>
        <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Edit Results Pack • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href={packId ? `/admin/results-packs/${packId}` : '/admin/results-packs'}
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to {packId ? 'Results Pack' : 'Results Packs'}
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Edit Results Pack</h1>
            {packInfo && (
              <p className="text-lg text-gray-600">
                {packInfo.assessmentType} v{packInfo.resultsVersion} • {packInfo.levelId}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-red-800 font-semibold mb-2">{error}</p>
              {validationErrors.length > 0 && (
                <ul className="list-disc list-inside text-sm text-red-700">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSave} className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 space-y-8">
            {/* Label */}
            <div>
              <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-2">
                Label *
              </label>
              <input
                type="text"
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Summary */}
            <div>
              <label htmlFor="summary" className="block text-sm font-medium text-gray-700 mb-2">
                Summary *
              </label>
              <textarea
                id="summary"
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Key Patterns */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Key Patterns *
              </label>
              <div className="space-y-2">
                {formData.keyPatterns.map((pattern, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={pattern}
                      onChange={(e) => updateArrayField('keyPatterns', index, e.target.value)}
                      required
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeArrayItem('keyPatterns', index)}
                      className="px-3 py-2 text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addArrayItem('keyPatterns')}
                  className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md"
                >
                  + Add Pattern
                </button>
              </div>
            </div>

            {/* First Focus Areas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Focus Areas *
              </label>
              <div className="space-y-2">
                {formData.firstFocusAreas.map((area, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={area}
                      onChange={(e) => updateArrayField('firstFocusAreas', index, e.target.value)}
                      required
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeArrayItem('firstFocusAreas', index)}
                      className="px-3 py-2 text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addArrayItem('firstFocusAreas')}
                  className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md"
                >
                  + Add Focus Area
                </button>
              </div>
            </div>

            {/* Method Positioning */}
            <div>
              <label htmlFor="methodPositioning" className="block text-sm font-medium text-gray-700 mb-2">
                Method Positioning *
              </label>
              <textarea
                id="methodPositioning"
                value={formData.methodPositioning}
                onChange={(e) => setFormData({ ...formData, methodPositioning: e.target.value })}
                required
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Change Summary */}
            <div>
              <label htmlFor="changeSummary" className="block text-sm font-medium text-gray-700 mb-2">
                Change Summary
              </label>
              <input
                type="text"
                id="changeSummary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Brief description of changes made"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
              <Link
                href={packId ? `/admin/results-packs/${packId}` : '/admin/results-packs'}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save as New Revision'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<EditPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, revisionId: '' } };
  }
  const revisionId = context.params?.revisionId as string;
  return { props: { user, revisionId } };
};

