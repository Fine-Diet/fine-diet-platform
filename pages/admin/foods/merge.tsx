/**
 * Admin Page: Merge Foods
 * 
 * Tool to merge duplicate foods. Moves all references from losers to winner.
 * Protected: requires admin role (merge is destructive)
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import type { AdminFoodObject, MergeDryRunResponse, MergeApplyResponse } from '@/lib/admin/foodTypes';

interface MergeFoodsProps {
  user: AuthenticatedUser;
  initialWinnerId: string | null;
}

export default function MergeFoods({ user, initialWinnerId }: MergeFoodsProps) {
  const router = useRouter();
  const [step, setStep] = useState<'select' | 'preview' | 'result'>('select');
  
  // Selection
  const [winnerSearch, setWinnerSearch] = useState('');
  const [winnerResults, setWinnerResults] = useState<AdminFoodObject[]>([]);
  const [selectedWinner, setSelectedWinner] = useState<AdminFoodObject | null>(null);
  
  const [loserSearch, setLoserSearch] = useState('');
  const [loserResults, setLoserResults] = useState<AdminFoodObject[]>([]);
  const [selectedLosers, setSelectedLosers] = useState<AdminFoodObject[]>([]);
  
  const [reason, setReason] = useState('');
  
  // Preview/Result
  const [dryRunResult, setDryRunResult] = useState<MergeDryRunResponse | null>(null);
  const [applyResult, setApplyResult] = useState<MergeApplyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial winner if provided
  useEffect(() => {
    if (initialWinnerId) {
      fetch(`/api/admin/foods/${initialWinnerId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.id) setSelectedWinner(data);
        })
        .catch(console.error);
    }
  }, [initialWinnerId]);

  // Search foods
  const searchFoods = async (query: string, setter: (foods: AdminFoodObject[]) => void) => {
    if (!query.trim() || query.length < 2) {
      setter([]);
      return;
    }
    try {
      const response = await fetch(`/api/admin/foods?query=${encodeURIComponent(query)}&limit=10`);
      const data = await response.json();
      setter(data.foods || []);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  // Handle winner search
  useEffect(() => {
    const timeout = setTimeout(() => searchFoods(winnerSearch, setWinnerResults), 300);
    return () => clearTimeout(timeout);
  }, [winnerSearch]);

  // Handle loser search
  useEffect(() => {
    const timeout = setTimeout(() => searchFoods(loserSearch, setLoserResults), 300);
    return () => clearTimeout(timeout);
  }, [loserSearch]);

  const handleDryRun = async () => {
    if (!selectedWinner || selectedLosers.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/foods/merge/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_id: selectedWinner.id,
          loser_ids: selectedLosers.map((l) => l.id),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Dry run failed');
      }

      const result: MergeDryRunResponse = await response.json();
      setDryRunResult(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry run failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedWinner || selectedLosers.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/foods/merge/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_id: selectedWinner.id,
          loser_ids: selectedLosers.map((l) => l.id),
          reason: reason || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Merge failed');
      }

      const result: MergeApplyResponse = await response.json();
      setApplyResult(result);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('select');
    setSelectedWinner(null);
    setSelectedLosers([]);
    setDryRunResult(null);
    setApplyResult(null);
    setError(null);
    setReason('');
    setWinnerSearch('');
    setLoserSearch('');
  };

  const addLoser = (food: AdminFoodObject) => {
    if (food.id === selectedWinner?.id) return;
    if (selectedLosers.find((l) => l.id === food.id)) return;
    setSelectedLosers((prev) => [...prev, food]);
    setLoserSearch('');
    setLoserResults([]);
  };

  const removeLoser = (id: string) => {
    setSelectedLosers((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <>
      <Head>
        <title>Merge Foods • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link href="/admin/foods" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
              ← Back to Foods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Merge Foods</h1>
            <p className="text-gray-600 mt-1">
              Merge duplicate foods. All references (logs, favorites, meals) will be moved from losers to the winner.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Step 1: Select */}
          {step === 'select' && (
            <div className="space-y-6">
              {/* Winner Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Select Winner (Keep)</h2>
                {selectedWinner ? (
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{selectedWinner.canonical_name}</div>
                      <div className="text-sm text-gray-600">
                        {selectedWinner.brand_name || 'No brand'} • {selectedWinner.source_provider}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedWinner(null)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={winnerSearch}
                      onChange={(e) => setWinnerSearch(e.target.value)}
                      placeholder="Search for winner food..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                    {winnerResults.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-md divide-y">
                        {winnerResults.map((food) => (
                          <button
                            key={food.id}
                            onClick={() => {
                              setSelectedWinner(food);
                              setWinnerSearch('');
                              setWinnerResults([]);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50"
                          >
                            <div className="font-medium text-gray-900">{food.canonical_name}</div>
                            <div className="text-sm text-gray-500">
                              {food.brand_name || 'No brand'} • {food.source_provider}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Losers Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">2. Select Losers (Merge Away)</h2>
                
                {/* Selected losers */}
                {selectedLosers.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {selectedLosers.map((loser) => (
                      <div key={loser.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">{loser.canonical_name}</div>
                          <div className="text-sm text-gray-600">
                            {loser.brand_name || 'No brand'} • {loser.source_provider}
                          </div>
                        </div>
                        <button
                          onClick={() => removeLoser(loser.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search for more losers */}
                <div>
                  <input
                    type="text"
                    value={loserSearch}
                    onChange={(e) => setLoserSearch(e.target.value)}
                    placeholder="Search for foods to merge away..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                  {loserResults.length > 0 && (
                    <div className="mt-2 border border-gray-200 rounded-md divide-y">
                      {loserResults
                        .filter((f) => f.id !== selectedWinner?.id && !selectedLosers.find((l) => l.id === f.id))
                        .map((food) => (
                          <button
                            key={food.id}
                            onClick={() => addLoser(food)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50"
                          >
                            <div className="font-medium text-gray-900">{food.canonical_name}</div>
                            <div className="text-sm text-gray-500">
                              {food.brand_name || 'No brand'} • {food.source_provider}
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">3. Reason (Optional)</h2>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are you merging these foods?"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end">
                <button
                  onClick={handleDryRun}
                  disabled={loading || !selectedWinner || selectedLosers.length === 0}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Preview Merge'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && dryRunResult && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Merge Preview</h2>
                
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Winner (Keep)</div>
                  <div className="font-medium text-gray-900">{dryRunResult.winner.canonical_name}</div>
                  <div className="text-sm text-gray-500">{dryRunResult.winner.brand_name || 'No brand'}</div>
                </div>

                <div className="mb-6">
                  <div className="text-sm text-gray-600 mb-2">Losers (Will be merged away)</div>
                  <div className="space-y-2">
                    {dryRunResult.losers.map((loser) => (
                      <div key={loser.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="font-medium text-gray-900">{loser.canonical_name}</div>
                        <div className="text-sm text-gray-500">{loser.brand_name || 'No brand'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="font-medium text-yellow-800 mb-2">
                    References to Move: {dryRunResult.total_references}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {dryRunResult.impact.map((imp) => (
                      <div key={imp.loser_id} className="text-yellow-700">
                        <div className="truncate text-xs">{dryRunResult.losers.find((l) => l.id === imp.loser_id)?.canonical_name}</div>
                        <div>Prefs: {imp.user_food_preferences}</div>
                        <div>Logs: {imp.journal_entries}</div>
                        <div>Meals: {imp.journal_meal_templates}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <strong>Warning:</strong> This action cannot be undone. Loser foods will be soft-deleted and all their references will be moved to the winner.
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-between">
                <button
                  onClick={() => setStep('select')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={loading}
                  className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Merging...' : 'Confirm Merge'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 'result' && applyResult && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Merge Complete</h2>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-3xl font-bold text-green-600">{applyResult.successful_merges}</div>
                    <div className="text-sm text-gray-600">Successful</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-3xl font-bold text-red-600">{applyResult.failed_merges}</div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {applyResult.results.map((result) => (
                    <div
                      key={result.loser_id}
                      className={`p-3 rounded-lg ${result.success ? 'bg-green-50' : 'bg-red-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={result.success ? 'text-green-800' : 'text-red-800'}>
                          {result.success ? '✓' : '✗'} {result.loser_id.slice(0, 8)}...
                        </span>
                        <span className="text-sm text-gray-600">
                          Refs moved: {Object.values(result.references_moved).reduce((a, b) => a + b, 0)}
                        </span>
                      </div>
                      {result.error && (
                        <div className="text-sm text-red-600 mt-1">{result.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Merge More
                </button>
                <Link
                  href={`/admin/foods/${applyResult.winner_id}`}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  View Winner Food
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<MergeFoodsProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  // Merge is admin-only
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  // Use null instead of undefined - Next.js cannot serialize undefined in SSR props
  const initialWinnerId = (context.query.winner as string) || null;

  return {
    props: { user, initialWinnerId },
  };
};
