/**
 * Admin Page: Edit Food
 * 
 * Form to edit an existing food item.
 * Protected: requires admin or editor role
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useMemo } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import type { AdminFoodObject, AdminFoodUpdateInput } from '@/lib/admin/foodTypes';
import { calculateScoreReadiness, getScoreReadinessClasses, getScoreReadinessLabel } from '@/lib/admin/foodUtils';

interface EditFoodProps {
  user: AuthenticatedUser;
  foodId: string;
}

export default function EditFood({ user, foodId }: EditFoodProps) {
  const router = useRouter();
  const [food, setFood] = useState<AdminFoodObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [form, setForm] = useState<AdminFoodUpdateInput>({});

  useEffect(() => {
    async function fetchFood() {
      try {
        const response = await fetch(`/api/admin/foods/${foodId}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Food not found');
        }
        const data: AdminFoodObject = await response.json();
        setFood(data);
        setForm({
          canonical_name: data.canonical_name,
          brand_name: data.brand_name,
          upc: data.upc,
          serving_size_g: data.serving_size_g,
          serving_unit: data.serving_unit,
          serving_description: data.serving_description,
          household_serving_text: data.household_serving_text,
          // Core macros
          calories: data.calories,
          protein_g: data.protein_g,
          carbs_g: data.carbs_g,
          fat_g: data.fat_g,
          fiber_g: data.fiber_g,
          // Minerals
          potassium_mg: data.potassium_mg,
          magnesium_mg: data.magnesium_mg,
          iron_mg: data.iron_mg,
          calcium_mg: data.calcium_mg,
          zinc_mg: data.zinc_mg,
          // Vitamins
          folate_ug: data.folate_ug,
          vitamin_a_ug_rae: data.vitamin_a_ug_rae,
          vitamin_c_mg: data.vitamin_c_mg,
          vitamin_d_ug: data.vitamin_d_ug,
          vitamin_b12_ug: data.vitamin_b12_ug,
          // Penalty
          sodium_mg: data.sodium_mg,
          // Metadata
          category: data.category,
          image_url: data.image_url,
          is_verified: data.is_verified,
          verification_notes: data.verification_notes,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load food');
      } finally {
        setLoading(false);
      }
    }
    fetchFood();
  }, [foodId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/foods/${foodId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update food');
      }

      const updated: AdminFoodObject = await response.json();
      setFood(updated);
      setSuccessMessage('Food saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error updating food:', err);
      setError(err instanceof Error ? err.message : 'Failed to update food');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/foods/${foodId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verification_notes: form.verification_notes }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to verify food');
      }

      const updated: AdminFoodObject = await response.json();
      setFood(updated);
      setForm((prev) => ({ ...prev, is_verified: updated.is_verified }));
      setSuccessMessage('Food verified!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify food');
    } finally {
      setSaving(false);
    }
  };

  const handleUnverify = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/foods/${foodId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unverify: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unverify food');
      }

      const updated: AdminFoodObject = await response.json();
      setFood(updated);
      setForm((prev) => ({ ...prev, is_verified: updated.is_verified }));
      setSuccessMessage('Verification removed.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unverify food');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AdminFoodUpdateInput>(field: K, value: AdminFoodUpdateInput[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Calculate score readiness based on current form values
  const scoreReadiness = useMemo(() => calculateScoreReadiness(form as Partial<AdminFoodObject>), [form]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!food) {
    return (
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error || 'Food not found'}</p>
          <Link href="/admin/foods" className="text-blue-600 hover:underline">← Back to Foods</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Edit {food.canonical_name} • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link href="/admin/foods" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
              ← Back to Foods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{food.canonical_name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                food.source_provider === 'fine_diet' ? 'bg-purple-100 text-purple-800' :
                food.source_provider === 'usda' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {food.source_provider || 'unknown'}
              </span>
              {food.is_verified && <span className="text-green-600">✓ Verified</span>}
              <span className="text-gray-400">ID: {food.id}</span>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={form.canonical_name || ''}
                    onChange={(e) => updateField('canonical_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={form.brand_name || ''}
                    onChange={(e) => updateField('brand_name', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UPC</label>
                  <input
                    type="text"
                    value={form.upc || ''}
                    onChange={(e) => updateField('upc', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={form.category || ''}
                    onChange={(e) => updateField('category', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={form.image_url || ''}
                    onChange={(e) => updateField('image_url', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Serving Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Serving Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serving Size (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.serving_size_g ?? ''}
                    onChange={(e) => updateField('serving_size_g', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serving Unit</label>
                  <input
                    type="text"
                    value={form.serving_unit || ''}
                    onChange={(e) => updateField('serving_unit', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serving Description</label>
                  <input
                    type="text"
                    value={form.serving_description || ''}
                    onChange={(e) => updateField('serving_description', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Score Readiness Indicator */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Nutrition Density Score Readiness</h3>
                  <p className="text-xs text-gray-500 mt-1">Based on micronutrient completeness</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreReadinessClasses(scoreReadiness)}`}>
                  {getScoreReadinessLabel(scoreReadiness)}
                </span>
              </div>
            </div>

            {/* Section 1: Macros */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Macros (per serving)</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calories (kcal)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.calories ?? ''}
                    onChange={(e) => updateField('calories', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.protein_g ?? ''}
                    onChange={(e) => updateField('protein_g', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fiber (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.fiber_g ?? ''}
                    onChange={(e) => updateField('fiber_g', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Carbs (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.carbs_g ?? ''}
                    onChange={(e) => updateField('carbs_g', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fat (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.fat_g ?? ''}
                    onChange={(e) => updateField('fat_g', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Micronutrients */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Micronutrients (per serving)</h2>
              <p className="text-sm text-gray-500 mb-4">Fill these to improve Nutrition Density Score readiness</p>
              
              {/* Minerals */}
              <h3 className="text-sm font-medium text-gray-700 mb-3 border-b pb-1">Minerals</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Potassium (mg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.potassium_mg ?? ''}
                    onChange={(e) => updateField('potassium_mg', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Magnesium (mg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.magnesium_mg ?? ''}
                    onChange={(e) => updateField('magnesium_mg', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Iron (mg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.iron_mg ?? ''}
                    onChange={(e) => updateField('iron_mg', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calcium (mg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.calcium_mg ?? ''}
                    onChange={(e) => updateField('calcium_mg', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zinc (mg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.zinc_mg ?? ''}
                    onChange={(e) => updateField('zinc_mg', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>

              {/* Vitamins */}
              <h3 className="text-sm font-medium text-gray-700 mb-3 border-b pb-1">Vitamins</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Folate (μg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.folate_ug ?? ''}
                    onChange={(e) => updateField('folate_ug', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vitamin A (μg RAE)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.vitamin_a_ug_rae ?? ''}
                    onChange={(e) => updateField('vitamin_a_ug_rae', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vitamin C (mg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.vitamin_c_mg ?? ''}
                    onChange={(e) => updateField('vitamin_c_mg', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vitamin D (μg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.vitamin_d_ug ?? ''}
                    onChange={(e) => updateField('vitamin_d_ug', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vitamin B12 (μg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.vitamin_b12_ug ?? ''}
                    onChange={(e) => updateField('vitamin_b12_ug', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>

              {/* Penalty Nutrient */}
              <h3 className="text-sm font-medium text-gray-700 mb-3 border-b pb-1">Penalty Nutrient</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sodium (mg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.sodium_mg ?? ''}
                    onChange={(e) => updateField('sodium_mg', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Verification */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Verification</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {food.is_verified ? (
                    <>
                      <span className="text-green-600 font-medium">✓ Verified</span>
                      <button
                        type="button"
                        onClick={handleUnverify}
                        disabled={saving}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Remove verification
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      Mark as Verified
                    </button>
                  )}
                </div>
                {food.verified_at && (
                  <p className="text-sm text-gray-500">
                    Verified on {new Date(food.verified_at).toLocaleDateString()}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification Notes</label>
                  <textarea
                    value={form.verification_notes || ''}
                    onChange={(e) => updateField('verification_notes', e.target.value || null)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* System Info */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">System Information</h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Source Provider</dt>
                  <dd className="font-medium text-gray-900">{food.source_provider || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Source ID</dt>
                  <dd className="font-medium text-gray-900 break-all">{food.source_id || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Source Dataset</dt>
                  <dd className="font-medium text-gray-900">{food.source_dataset || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Source Type</dt>
                  <dd className="font-medium text-gray-900">{food.source_type}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium text-gray-900">{new Date(food.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Updated</dt>
                  <dd className="font-medium text-gray-900">{new Date(food.updated_at).toLocaleString()}</dd>
                </div>
              </dl>
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <Link
                href={`/admin/foods/merge?winner=${food.id}`}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Merge into this food
              </Link>
              <div className="flex gap-3">
                <Link
                  href="/admin/foods"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<EditFoodProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  const foodId = context.params?.id as string;

  return {
    props: { user, foodId },
  };
};
