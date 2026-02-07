/**
 * Admin Page: Bulk Import Foods
 * 
 * Upload CSV to bulk import Fine Diet internal foods.
 * Protected: requires admin or editor role
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useRef } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import type { BulkImportRow, BulkImportDryRunResponse, BulkImportApplyResponse } from '@/lib/admin/foodTypes';

interface ImportFoodsProps {
  user: AuthenticatedUser;
}

function parseCSV(text: string): BulkImportRow[] {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  const rows: BulkImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parsing (doesn't handle quoted commas)
    const values = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row as unknown as BulkImportRow);
  }

  return rows;
}

export default function ImportFoods({ user }: ImportFoodsProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [dryRunResult, setDryRunResult] = useState<BulkImportDryRunResponse | null>(null);
  const [applyResult, setApplyResult] = useState<BulkImportApplyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          setError('No data rows found in CSV');
          return;
        }
        setRows(parsed);
        handleDryRun(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
      }
    };
    reader.readAsText(file);
  };

  const handleDryRun = async (data: BulkImportRow[]) => {
    setLoading(true);
    setError(null);
    setDryRunResult(null);

    try {
      const response = await fetch('/api/admin/foods/import/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: data }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Dry run failed');
      }

      const result: BulkImportDryRunResponse = await response.json();
      setDryRunResult(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry run failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/foods/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Import failed');
      }

      const result: BulkImportApplyResponse = await response.json();
      setApplyResult(result);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setRows([]);
    setDryRunResult(null);
    setApplyResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <Head>
        <title>Bulk Import • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link href="/admin/foods" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
              ← Back to Foods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Bulk Import Foods</h1>
            <p className="text-gray-600 mt-1">Upload a CSV file to import multiple Fine Diet foods at once.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CSV File</h2>
              
              {/* Download Template */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-4">
                    <a
                      href="/templates/fine-diet-foods-import-template-v2.csv"
                      download="fine-diet-foods-import-template.csv"
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-50"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download CSV Template (v2)
                    </a>
                    <p className="text-sm text-blue-700">
                      Use this template. Do not rename headers. Leave optional columns blank.
                    </p>
                  </div>
                  <p className="text-xs text-blue-600">
                    v2 includes Nutrition Density Score fields (minerals, vitamins). Vitamin A uses RAE (μg).
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              {loading && <p className="text-gray-600">Processing...</p>}

              <div className="mt-6 p-4 bg-gray-50 rounded-md">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Expected CSV columns (v2 schema):</h3>
                <div className="text-sm text-gray-600 space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-700">Identity:</h4>
                    <ul className="list-disc list-inside">
                      <li><strong>canonical_name</strong> (required) - Food name</li>
                      <li>brand_name - Brand name (optional)</li>
                      <li>upc - Barcode (optional)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Macros:</h4>
                    <ul className="list-disc list-inside">
                      <li>calories_kcal, protein_g, fiber_g (required for scoring)</li>
                      <li>carbs_g, fat_g (recommended)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Micronutrients (for Nutrition Density Score):</h4>
                    <ul className="list-disc list-inside">
                      <li>Minerals: potassium_mg, magnesium_mg, iron_mg, calcium_mg, zinc_mg</li>
                      <li>Vitamins: folate_ug, <strong>vitamin_a_ug_rae</strong> (RAE!), vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug</li>
                      <li>Penalty: sodium_mg</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Serving/Basis:</h4>
                    <ul className="list-disc list-inside">
                      <li>serving_size_g (default: 100), serving_unit (default: g)</li>
                      <li>serving_description, household_serving_text (optional)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Metadata:</h4>
                    <ul className="list-disc list-inside">
                      <li>category, tags (comma-separated)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && dryRunResult && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Preview</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-3xl font-bold text-gray-900">{dryRunResult.total_rows}</div>
                    <div className="text-sm text-gray-600">Total Rows</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-3xl font-bold text-green-600">{dryRunResult.new_count}</div>
                    <div className="text-sm text-gray-600">New</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-3xl font-bold text-blue-600">{dryRunResult.update_count}</div>
                    <div className="text-sm text-gray-600">Updates</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-3xl font-bold text-red-600">{dryRunResult.error_count}</div>
                    <div className="text-sm text-gray-600">Errors</div>
                  </div>
                </div>
              </div>

              {/* Errors */}
              {dryRunResult.errors.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
                  <h3 className="text-lg font-semibold text-red-800 mb-4">
                    Validation Errors ({dryRunResult.errors.length})
                  </h3>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {dryRunResult.errors.map((err, idx) => (
                      <div key={idx} className="text-sm text-red-700 p-2 bg-red-50 rounded">
                        {err.errors.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {dryRunResult.warnings.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-yellow-200 p-6">
                  <h3 className="text-lg font-semibold text-yellow-800 mb-4">
                    Warnings ({dryRunResult.warnings.length})
                  </h3>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {dryRunResult.warnings.slice(0, 20).map((warn, idx) => (
                      <div key={idx} className="text-sm text-yellow-700">
                        {warn.warnings.join(', ')}
                      </div>
                    ))}
                    {dryRunResult.warnings.length > 20 && (
                      <p className="text-sm text-yellow-600">
                        ...and {dryRunResult.warnings.length - 20} more warnings
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Preview (first 20 rows)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Brand</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Calories</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {dryRunResult.preview.slice(0, 20).map((item) => (
                        <tr key={item.row_index} className={!item.valid ? 'bg-red-50' : ''}>
                          <td className="px-4 py-2 text-sm text-gray-500">{item.row_index + 1}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              item.action === 'create' ? 'bg-green-100 text-green-800' :
                              item.action === 'update' ? 'bg-blue-100 text-blue-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {item.action}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.data.canonical_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{item.data.brand_name || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{item.data.calories || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Start Over
                </button>
                <button
                  onClick={handleApply}
                  disabled={loading || dryRunResult.error_count === dryRunResult.total_rows}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Importing...' : `Apply Import (${dryRunResult.new_count + dryRunResult.update_count} foods)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 'result' && applyResult && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Complete</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-3xl font-bold text-gray-900">{applyResult.total_rows}</div>
                    <div className="text-sm text-gray-600">Total Rows</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-3xl font-bold text-green-600">{applyResult.inserted_count}</div>
                    <div className="text-sm text-gray-600">Inserted</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-3xl font-bold text-blue-600">{applyResult.updated_count}</div>
                    <div className="text-sm text-gray-600">Updated</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-3xl font-bold text-red-600">{applyResult.error_count}</div>
                    <div className="text-sm text-gray-600">Errors</div>
                  </div>
                </div>
              </div>

              {applyResult.errors.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
                  <h3 className="text-lg font-semibold text-red-800 mb-4">Errors</h3>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {applyResult.errors.map((err, idx) => (
                      <div key={idx} className="text-sm text-red-700 p-2 bg-red-50 rounded">
                        Row {err.row_index + 1}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Import More
                </button>
                <Link
                  href="/admin/foods"
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  View Foods
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ImportFoodsProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  return {
    props: { user },
  };
};
