/**
 * Admin Page: Create New Food
 * 
 * Form to create a new Fine Diet internal food.
 * Protected: requires admin or editor role
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useMemo } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import type { AdminFoodCreateInput } from '@/lib/admin/foodTypes';
import { calculateScoreReadiness, getScoreReadinessClasses, getScoreReadinessLabel } from '@/lib/admin/foodUtils';

interface NewFoodProps {
  user: AuthenticatedUser;
}

export default function NewFood({ user }: NewFoodProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<AdminFoodCreateInput>({
    canonical_name: '',
    brand_name: '',
    upc: '',
    serving_size_g: 100,
    serving_unit: 'g',
    serving_description: '',
    household_serving_text: '',
    // Core macros
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    // Minerals
    potassium_mg: null,
    magnesium_mg: null,
    iron_mg: null,
    calcium_mg: null,
    zinc_mg: null,
    // Vitamins
    folate_ug: null,
    vitamin_a_ug_rae: null,
    vitamin_c_mg: null,
    vitamin_d_ug: null,
    vitamin_b12_ug: null,
    // Penalty
    sodium_mg: null,
    // Metadata
    category: '',
    tags: [],
    image_url: '',
    is_verified: false,
    verification_notes: '',
  });

  // Calculate score readiness based on current form values
  const scoreReadiness = useMemo(() => calculateScoreReadiness(form), [form]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/foods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create food');
      }

      const created = await response.json();
      router.push(`/admin/foods/${created.id}`);
    } catch (err) {
      console.error('Error creating food:', err);
      setError(err instanceof Error ? err.message : 'Failed to create food');
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AdminFoodCreateInput>(field: K, value: AdminFoodCreateInput[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <Head>
        <title>New Food • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link href="/admin/foods" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
              ← Back to Foods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Create New Food</h1>
            <p className="text-gray-600 mt-1">Add a new Fine Diet internal food to the database.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.canonical_name}
                    onChange={(e) => updateField('canonical_name', e.target.value)}
                    placeholder="e.g., Chicken Breast, Grilled"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={form.brand_name || ''}
                    onChange={(e) => updateField('brand_name', e.target.value || null)}
                    placeholder="e.g., Tyson"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UPC</label>
                  <input
                    type="text"
                    value={form.upc || ''}
                    onChange={(e) => updateField('upc', e.target.value || null)}
                    placeholder="e.g., 012345678901"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={form.category || ''}
                    onChange={(e) => updateField('category', e.target.value || null)}
                    placeholder="e.g., Protein, Dairy, Vegetables"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={form.image_url || ''}
                    onChange={(e) => updateField('image_url', e.target.value || null)}
                    placeholder="https://..."
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
                    onChange={(e) => updateField('serving_size_g', e.target.value ? parseFloat(e.target.value) : 100)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serving Unit</label>
                  <input
                    type="text"
                    value={form.serving_unit || ''}
                    onChange={(e) => updateField('serving_unit', e.target.value || 'g')}
                    placeholder="g, oz, cup, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serving Description</label>
                  <input
                    type="text"
                    value={form.serving_description || ''}
                    onChange={(e) => updateField('serving_description', e.target.value || null)}
                    placeholder="e.g., 1 cup (240g)"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calories (kcal) <span className="text-red-500">*</span></label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g) <span className="text-red-500">*</span></label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fiber (g) <span className="text-red-500">*</span></label>
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
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_verified}
                    onChange={(e) => updateField('is_verified', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Mark as verified</span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification Notes</label>
                  <textarea
                    value={form.verification_notes || ''}
                    onChange={(e) => updateField('verification_notes', e.target.value || null)}
                    rows={2}
                    placeholder="Notes about data source or verification..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
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
                {saving ? 'Creating...' : 'Create Food'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<NewFoodProps> = async (context) => {
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
