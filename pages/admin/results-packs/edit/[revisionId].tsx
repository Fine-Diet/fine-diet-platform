/**
 * Admin Page: Edit Results Pack Revision
 * 
 * Form-based editor for results pack content with Flow v2 support.
 * Creates a new draft revision on save (immutable revisions).
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { ResultsPack, FlowPage1, FlowPage2, FlowPage3 } from '@/lib/assessments/results/loadResultsPack';

interface EditPageProps {
  user: AuthenticatedUser | null;
  packId: string;
  packInfo: {
    assessmentType: string;
    resultsVersion: string;
    levelId: string;
  } | null;
  initialFormData: ResultsPack | null;
  revisionId: string;
}

export default function ResultsPackEditPage({ user, packId, packInfo, initialFormData, revisionId }: EditPageProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showLegacyFields, setShowLegacyFields] = useState(false);
  
  // Initialize flow data from existing pack or defaults
  const getInitialFlow = () => {
    const flow = initialFormData?.flow as any;
    return {
      page1: (flow?.page1 && flow.page1.headline && flow.page1.body && flow.page1.snapshotBullets && flow.page1.meaningBody)
        ? (flow.page1 as FlowPage1)
        : getDefaultPage1(),
      page2: (flow?.page2 && flow.page2.stepBullets && flow.page2.videoCtaLabel)
        ? (flow.page2 as FlowPage2)
        : getDefaultPage2(),
      page3: (flow?.page3 && flow.page3.problemHeadline && flow.page3.problemBody && flow.page3.tryBullets &&
              flow.page3.methodTitle && flow.page3.methodBody && flow.page3.methodLearnBullets &&
              flow.page3.methodCtaLabel && flow.page3.methodEmailLinkLabel)
        ? (flow.page3 as FlowPage3)
        : getDefaultPage3(),
    };
  };

  const getDefaultPage1 = (): FlowPage1 => ({
    headline: '',
    body: [''],
    snapshotTitle: "What We're Seeing",
    snapshotBullets: ['', '', ''],
    meaningTitle: "What This Often Means",
    meaningBody: '',
  });

  const getDefaultPage2 = (): FlowPage2 => ({
    headline: 'First Steps',
    stepBullets: ['', '', ''],
    videoCtaLabel: 'Watch Your Gut Pattern Breakdown',
  });

  const getDefaultPage3 = (): FlowPage3 => ({
    problemHeadline: '',
    problemBody: [''],
    tryTitle: '',
    tryBullets: ['', '', ''],
    tryCloser: '',
    mechanismTitle: '',
    mechanismBodyTop: '',
    mechanismBodyBottom: '',
    methodTitle: '',
    methodBody: [''],
    methodLearnTitle: "In the video, you'll learn",
    methodLearnBullets: ['', '', ''],
    methodCtaLabel: 'Watch How The Fine Diet Method Works',
    methodEmailLinkLabel: 'Email me the link',
  });

  // Form state
  const [formData, setFormData] = useState<ResultsPack>(
    initialFormData || {
      label: '',
      summary: '',
      keyPatterns: [],
      firstFocusAreas: [],
      methodPositioning: '',
    }
  );
  const [flowData, setFlowData] = useState(getInitialFlow());
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setValidationErrors([]);

    try {
      // Merge flow into formData
      const contentToSave: ResultsPack = {
        ...formData,
        flow: {
          page1: flowData.page1,
          page2: flowData.page2,
          page3: flowData.page3,
        },
      };

      const response = await fetch(`/api/admin/results-packs/${packId}/revisions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_json: contentToSave,
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

  // Helper functions for flow arrays
  const updateFlowArray = (page: 'page1' | 'page2' | 'page3', field: string, index: number, value: string) => {
    const currentPage = flowData[page] || (page === 'page1' ? getDefaultPage1() : page === 'page2' ? getDefaultPage2() : getDefaultPage3());
    const currentArray = (currentPage as any)[field] || [];
    setFlowData({
      ...flowData,
      [page]: {
        ...currentPage,
        [field]: currentArray.map((item: string, i: number) => i === index ? value : item),
      },
    });
  };

  const addFlowArrayItem = (page: 'page1' | 'page2' | 'page3', field: string) => {
    const currentPage = flowData[page] || (page === 'page1' ? getDefaultPage1() : page === 'page2' ? getDefaultPage2() : getDefaultPage3());
    const currentArray = (currentPage as any)[field] || [];
    setFlowData({
      ...flowData,
      [page]: {
        ...currentPage,
        [field]: [...currentArray, ''],
      },
    });
  };

  const removeFlowArrayItem = (page: 'page1' | 'page2' | 'page3', field: string, index: number) => {
    const currentPage = flowData[page] || (page === 'page1' ? getDefaultPage1() : page === 'page2' ? getDefaultPage2() : getDefaultPage3());
    const currentArray = (currentPage as any)[field] || [];
    setFlowData({
      ...flowData,
      [page]: {
        ...currentPage,
        [field]: currentArray.filter((_: string, i: number) => i !== index),
      },
    });
  };

  // Helper for updating flow string fields
  const updateFlowField = (page: 'page1' | 'page2' | 'page3', field: string, value: string) => {
    const currentPage = flowData[page] || (page === 'page1' ? getDefaultPage1() : page === 'page2' ? getDefaultPage2() : getDefaultPage3());
    setFlowData({
      ...flowData,
      [page]: {
        ...currentPage,
        [field]: value,
      },
    });
  };

  // Legacy field helpers
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

  if (!packId || !packInfo) {
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
            {/* Label (required for all packs) */}
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
                className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Flow v2 Section */}
            <div className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Flow (Pages 1–3)</h2>

              {/* Page 1: Pattern Read */}
              <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Page 1: Pattern Read</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Headline *
                    </label>
                    <input
                      type="text"
                      value={flowData.page1?.headline || ''}
                      onChange={(e) => updateFlowField('page1', 'headline', e.target.value)}
                      required
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lead Description (Body) *
                    </label>
                    <div className="space-y-2">
                      {(flowData.page1?.body || ['']).map((paragraph, index) => (
                        <div key={index} className="flex gap-2">
                          <textarea
                            value={paragraph}
                            onChange={(e) => updateFlowArray('page1', 'body', index, e.target.value)}
                            required
                            rows={3}
                            className="flex-1 px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                          {(flowData.page1?.body || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFlowArrayItem('page1', 'body', index)}
                              className="px-3 py-2 text-red-600 hover:text-red-800"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addFlowArrayItem('page1', 'body')}
                        className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md"
                      >
                        + Add Paragraph
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Snapshot Title
                    </label>
                    <input
                      type="text"
                      value={flowData.page1?.snapshotTitle || ''}
                      onChange={(e) => updateFlowField('page1', 'snapshotTitle', e.target.value)}
                      placeholder="What We're Seeing"
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Snapshot Bullets (exactly 3) *
                    </label>
                    <div className="space-y-2">
                      {(flowData.page1?.snapshotBullets || ['', '', '']).map((bullet, index) => (
                        <input
                          key={index}
                          type="text"
                          value={bullet}
                          onChange={(e) => updateFlowArray('page1', 'snapshotBullets', index, e.target.value)}
                          required
                          className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Meaning Title
                    </label>
                    <input
                      type="text"
                      value={flowData.page1?.meaningTitle || ''}
                      onChange={(e) => updateFlowField('page1', 'meaningTitle', e.target.value)}
                      placeholder="What This Often Means"
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Meaning Body *
                    </label>
                    <textarea
                      value={flowData.page1?.meaningBody || ''}
                      onChange={(e) => updateFlowField('page1', 'meaningBody', e.target.value)}
                      required
                      rows={4}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Page 2: First Steps + Utilities */}
              <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Page 2: First Steps + Utilities</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Headline
                    </label>
                    <input
                      type="text"
                      value={flowData.page2?.headline || ''}
                      onChange={(e) => updateFlowField('page2', 'headline', e.target.value)}
                      placeholder="First Steps"
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Step Bullets (exactly 3) *
                    </label>
                    <div className="space-y-2">
                      {(flowData.page2?.stepBullets || ['', '', '']).map((bullet, index) => (
                        <input
                          key={index}
                          type="text"
                          value={bullet}
                          onChange={(e) => updateFlowArray('page2', 'stepBullets', index, e.target.value)}
                          required
                          className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Video CTA Label *
                    </label>
                    <input
                      type="text"
                      value={flowData.page2?.videoCtaLabel || ''}
                      onChange={(e) => updateFlowField('page2', 'videoCtaLabel', e.target.value)}
                      required
                      placeholder="Watch Your Gut Pattern Breakdown"
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Helper Text (optional)
                    </label>
                    <input
                      type="text"
                      value={flowData.page2.emailHelper || ''}
                      onChange={(e) => updateFlowField('page2', 'emailHelper', e.target.value)}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      PDF Helper Text (optional)
                    </label>
                    <input
                      type="text"
                      value={flowData.page2.pdfHelper || ''}
                      onChange={(e) => updateFlowField('page2', 'pdfHelper', e.target.value)}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Page 3: Narrative Close + Method CTA */}
              <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Page 3: Narrative Close + Method CTA</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Problem Headline *
                    </label>
                    <input
                      type="text"
                      value={flowData.page3?.problemHeadline || ''}
                      onChange={(e) => updateFlowField('page3', 'problemHeadline', e.target.value)}
                      required
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Problem Body *
                    </label>
                    <div className="space-y-2">
                      {(flowData.page3?.problemBody || ['']).map((paragraph, index) => (
                        <div key={index} className="flex gap-2">
                          <textarea
                            value={paragraph}
                            onChange={(e) => updateFlowArray('page3', 'problemBody', index, e.target.value)}
                            required
                            rows={3}
                            className="flex-1 px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                          {(flowData.page3?.problemBody || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFlowArrayItem('page3', 'problemBody', index)}
                              className="px-3 py-2 text-red-600 hover:text-red-800"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addFlowArrayItem('page3', 'problemBody')}
                        className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md"
                      >
                        + Add Paragraph
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      "What most people try" Title *
                    </label>
                    <input
                      type="text"
                      value={flowData.page3?.tryTitle || ''}
                      onChange={(e) => updateFlowField('page3', 'tryTitle', e.target.value)}
                      required
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      "What most people try" Bullets (exactly 3) *
                    </label>
                    <div className="space-y-2">
                      {(flowData.page3?.tryBullets || ['', '', '']).map((bullet, index) => (
                        <input
                          key={index}
                          type="text"
                          value={bullet}
                          onChange={(e) => updateFlowArray('page3', 'tryBullets', index, e.target.value)}
                          required
                          className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      "What most people try" Closer *
                    </label>
                    <textarea
                      value={flowData.page3?.tryCloser || ''}
                      onChange={(e) => updateFlowField('page3', 'tryCloser', e.target.value)}
                      required
                      rows={2}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Missing Mechanism Title *
                    </label>
                    <input
                      type="text"
                      value={flowData.page3?.mechanismTitle || ''}
                      onChange={(e) => updateFlowField('page3', 'mechanismTitle', e.target.value)}
                      required
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Missing Mechanism Body (Top) *
                    </label>
                    <textarea
                      value={flowData.page3?.mechanismBodyTop || ''}
                      onChange={(e) => updateFlowField('page3', 'mechanismBodyTop', e.target.value)}
                      required
                      rows={3}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Missing Mechanism Body (Bottom) *
                    </label>
                    <textarea
                      value={flowData.page3?.mechanismBodyBottom || ''}
                      onChange={(e) => updateFlowField('page3', 'mechanismBodyBottom', e.target.value)}
                      required
                      rows={3}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Method Section Title *
                    </label>
                    <input
                      type="text"
                      value={flowData.page3?.methodTitle || ''}
                      onChange={(e) => updateFlowField('page3', 'methodTitle', e.target.value)}
                      required
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Method Body *
                    </label>
                    <div className="space-y-2">
                      {(flowData.page3?.methodBody || ['']).map((paragraph, index) => (
                        <div key={index} className="flex gap-2">
                          <textarea
                            value={paragraph}
                            onChange={(e) => updateFlowArray('page3', 'methodBody', index, e.target.value)}
                            required
                            rows={3}
                            className="flex-1 px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                          {(flowData.page3?.methodBody || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFlowArrayItem('page3', 'methodBody', index)}
                              className="px-3 py-2 text-red-600 hover:text-red-800"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addFlowArrayItem('page3', 'methodBody')}
                        className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md"
                      >
                        + Add Paragraph
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      "In the video, you'll learn" Title
                    </label>
                    <input
                      type="text"
                      value={flowData.page3?.methodLearnTitle || ''}
                      onChange={(e) => updateFlowField('page3', 'methodLearnTitle', e.target.value)}
                      placeholder="In the video, you'll learn"
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      "In the video, you'll learn" Bullets (exactly 3) *
                    </label>
                    <div className="space-y-2">
                      {(flowData.page3?.methodLearnBullets || ['', '', '']).map((bullet, index) => (
                        <input
                          key={index}
                          type="text"
                          value={bullet}
                          onChange={(e) => updateFlowArray('page3', 'methodLearnBullets', index, e.target.value)}
                          required
                          className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Method CTA Label *
                    </label>
                    <input
                      type="text"
                      value={flowData.page3?.methodCtaLabel || ''}
                      onChange={(e) => updateFlowField('page3', 'methodCtaLabel', e.target.value)}
                      required
                      placeholder="Watch How The Fine Diet Method Works"
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Method Email Link Label *
                    </label>
                    <input
                      type="text"
                      value={flowData.page3?.methodEmailLinkLabel || ''}
                      onChange={(e) => updateFlowField('page3', 'methodEmailLinkLabel', e.target.value)}
                      required
                      placeholder="Email me the link"
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Legacy Fields (Collapsible) */}
            <div className="border-t border-gray-200 pt-8">
              <button
                type="button"
                onClick={() => setShowLegacyFields(!showLegacyFields)}
                className="flex items-center justify-between w-full text-left text-lg font-semibold text-gray-700 mb-4"
              >
                <span>Legacy Fields (Fallback Only)</span>
                <span className="text-sm text-gray-500">{showLegacyFields ? '−' : '+'}</span>
              </button>
              
              {showLegacyFields && (
                <div className="space-y-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 mb-4">
                    These fields are used as fallback when Flow v2 is not present. For new packs, use Flow v2 above.
                  </p>

                  <div>
                    <label htmlFor="summary" className="block text-sm font-medium text-gray-700 mb-2">
                      Summary
                    </label>
                    <textarea
                      id="summary"
                      value={formData.summary}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Key Patterns
                    </label>
                    <div className="space-y-2">
                      {formData.keyPatterns.map((pattern, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            value={pattern}
                            onChange={(e) => updateArrayField('keyPatterns', index, e.target.value)}
                            className="flex-1 px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Focus Areas
                    </label>
                    <div className="space-y-2">
                      {formData.firstFocusAreas.map((area, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            value={area}
                            onChange={(e) => updateArrayField('firstFocusAreas', index, e.target.value)}
                            className="flex-1 px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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

                  <div>
                    <label htmlFor="methodPositioning" className="block text-sm font-medium text-gray-700 mb-2">
                      Method Positioning
                    </label>
                    <textarea
                      id="methodPositioning"
                      value={formData.methodPositioning}
                      onChange={(e) => setFormData({ ...formData, methodPositioning: e.target.value })}
                      rows={6}
                      className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
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
                className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
    return { props: { user: null, packId: '', packInfo: null, initialFormData: null, revisionId: '' } };
  }

  const revisionId = context.params?.revisionId as string;
  if (!revisionId) {
    return { props: { user, packId: '', packInfo: null, initialFormData: null, revisionId: '' } };
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    
    // Try to fetch revision first
    const { data: rev, error: revError } = await supabaseAdmin
      .from('results_pack_revisions')
      .select('id, pack_id, content_json')
      .eq('id', revisionId)
      .single();

    let packId = '';
    let packInfo: { assessmentType: string; resultsVersion: string; levelId: string } | null = null;
    let initialFormData: ResultsPack | null = null;

    if (revError || !rev) {
      // If revision not found, try to get pack info (if revisionId is actually packId)
      const { data: pack, error: packError } = await supabaseAdmin
        .from('results_packs')
        .select('id, assessment_type, results_version, level_id')
        .eq('id', revisionId)
        .single();

      if (packError || !pack) {
        return { props: { user, packId: '', packInfo: null, initialFormData: null, revisionId } };
      }

      // New revision - pack exists but no revision yet
      packId = pack.id;
      packInfo = {
        assessmentType: pack.assessment_type,
        resultsVersion: pack.results_version,
        levelId: pack.level_id,
      };
      // initialFormData stays null (empty form)
    } else {
      // Existing revision - load content
      packId = rev.pack_id;
      initialFormData = rev.content_json as ResultsPack;

      // Get pack info
      const { data: pack, error: packError } = await supabaseAdmin
        .from('results_packs')
        .select('assessment_type, results_version, level_id')
        .eq('id', rev.pack_id)
        .single();

      if (!packError && pack) {
        packInfo = {
          assessmentType: pack.assessment_type,
          resultsVersion: pack.results_version,
          levelId: pack.level_id,
        };
      }
    }

    return { props: { user, packId, packInfo, initialFormData, revisionId } };
  } catch (error) {
    console.error('Error loading revision in getServerSideProps:', error);
    return { props: { user, packId: '', packInfo: null, initialFormData: null, revisionId } };
  }
};
