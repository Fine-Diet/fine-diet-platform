/**
 * Food Client Service — API wrapper for food search and UPC lookup
 */

import type {
  FoodObject,
  FoodSearchResponse,
  FoodSearchResult,
  UpcLookupResult,
  CreateCustomFoodInput,
} from './types';

// ============================================================================
// Helpers
// ============================================================================

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${res.status}`);
  }

  return res.json();
}

// Parse API response dates
function parseFoodObject(data: any): FoodObject {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function parseSearchResult(data: any): FoodSearchResult {
  return {
    ...data,
    food: parseFoodObject(data.food),
  };
}

function parseSearchResponse(data: any): FoodSearchResponse {
  return {
    results: data.results.map(parseSearchResult),
    yourFoods: data.yourFoods.map(parseSearchResult),
    branded: data.branded.map(parseSearchResult),
    common: data.common.map(parseSearchResult),
    totalCount: data.totalCount,
  };
}

// ============================================================================
// Food Service
// ============================================================================

export const foodService = {
  /**
   * Search foods by text query.
   * Returns grouped results with slotting applied.
   */
  async search(query: string, options: { limit?: number } = {}): Promise<FoodSearchResponse> {
    const { limit = 20 } = options;
    
    if (!query || query.trim().length < 2) {
      return { results: [], yourFoods: [], branded: [], common: [], totalCount: 0 };
    }

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        limit: limit.toString(),
      });
      
      const data = await apiFetch<FoodSearchResponse>(`/api/foods/search?${params}`);
      return parseSearchResponse(data);
    } catch (error) {
      console.error('[foodService.search] Error:', error);
      return { results: [], yourFoods: [], branded: [], common: [], totalCount: 0 };
    }
  },

  /**
   * Look up food by UPC barcode.
   * Creates provisional record if not found (allows immediate logging).
   */
  async lookupUpc(code: string, options: { createProvisional?: boolean } = {}): Promise<UpcLookupResult> {
    const { createProvisional = true } = options;

    try {
      const params = new URLSearchParams();
      if (!createProvisional) params.set('provisional', 'false');
      
      const url = `/api/foods/upc/${encodeURIComponent(code)}${params.toString() ? `?${params}` : ''}`;
      const data = await apiFetch<UpcLookupResult>(url);
      
      return {
        ...data,
        food: data.food ? parseFoodObject(data.food) : null,
      };
    } catch (error) {
      console.error('[foodService.lookupUpc] Error:', error);
      return { found: false, food: null, isProvisional: false, needsEnrichment: false };
    }
  },

  /**
   * Get a single food by ID.
   */
  async getById(id: string): Promise<FoodObject | null> {
    try {
      const data = await apiFetch<{ food: FoodObject }>(`/api/foods/${id}`);
      return parseFoodObject(data.food);
    } catch (error) {
      console.error('[foodService.getById] Error:', error);
      return null;
    }
  },

  /**
   * Create a custom food item.
   * Returns the newly created FoodObject.
   */
  async createCustomFood(input: CreateCustomFoodInput): Promise<FoodObject> {
    const data = await apiFetch<{ food: FoodObject }>('/api/foods/custom', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return parseFoodObject(data.food);
  },

  /**
   * Batch fetch nutrient data for multiple food IDs.
   * Returns minimal data needed for flag computation (micronutrients + confidence).
   */
  async batchGetNutrients(ids: string[]): Promise<FoodNutrientData[]> {
    if (ids.length === 0) {
      return [];
    }

    try {
      const data = await apiFetch<{ foods: FoodNutrientData[] }>('/api/foods/batch', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      return data.foods;
    } catch (error) {
      console.error('[foodService.batchGetNutrients] Error:', error);
      return [];
    }
  },
};

/**
 * Minimal food nutrient data for flag computation.
 */
export interface FoodNutrientData {
  id: string;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  nutrientConfidence: 'high' | 'medium' | 'low';
  nutrientProvenance: 'internal' | 'usda' | 'label' | 'estimated' | 'user';
}
