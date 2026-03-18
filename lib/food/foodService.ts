/**
 * Food Client Service — API wrapper for food search and UPC lookup
 */

import type {
  FoodObject,
  FoodSearchResponse,
  FoodSearchResult,
  UpcLookupResult,
  CreateCustomFoodInput,
  FoodResultSource,
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
  const results = (data.results || []).map(parseSearchResult);
  const yourFoods = (data.yourFoods || []).map(parseSearchResult);
  const branded = (data.branded || []).map(parseSearchResult);
  const common = (data.common || []).map(parseSearchResult);
  const sections = (data.sections || []).map((sec: any) => ({
    key: sec.key,
    label: sec.label ?? sec.key,
    order: sec.order ?? 0,
    topScore: sec.topScore ?? 0,
    total: sec.total ?? 0,
    shown: sec.shown ?? 0,
    hasMore: sec.hasMore ?? false,
    offset: sec.offset ?? 0,
    items: (sec.items || []).map(parseSearchResult),
    // Legacy compatibility
    sourceType: sec.sourceType,
  }));
  return {
    results,
    sections,
    totalReturned: data.totalReturned ?? results.length,
    yourFoods,
    branded,
    common,
    totalCount: data.totalCount ?? 0,
  };
}

// ============================================================================
// Food Service
// ============================================================================

// Section keys type for client-side use (matches server SectionKey)
export type SectionKey = 'my_foods' | 'common' | 'branded' | 'scanned' | 'other' | 'promoted_off' | 'off';

export type { FoodResultSource };

export const foodService = {
  /**
   * Search foods by text query.
   * Returns sectioned results in deterministic order (my_foods → common → branded → scanned → other).
   * 
   * Options:
   * - limit: Overall max results (default 50)
   * - sectionLimit: Max results per section (default 12)
   * - debug: Include debug info in response
   */
  async search(
    query: string,
    options: { limit?: number; sectionLimit?: number; debug?: boolean; sessionId?: string } = {}
  ): Promise<FoodSearchResponse> {
    const { limit = 50, sectionLimit = 12, debug = false, sessionId } = options;

    if (!query || query.trim().length < 2) {
      return { results: [], sections: [], totalReturned: 0, yourFoods: [], branded: [], common: [], totalCount: 0 };
    }

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        limit: limit.toString(),
        sectionLimit: sectionLimit.toString(),
      });
      if (debug) params.set('debug', 'true');

      const headers: HeadersInit = sessionId ? { 'x-session-id': sessionId } : {};
      const data = await apiFetch<FoodSearchResponse>(`/api/foods/search?${params}`, { headers });
      return parseSearchResponse(data);
    } catch (error) {
      console.error('[foodService.search] Error:', error);
      return { results: [], sections: [], totalReturned: 0, yourFoods: [], branded: [], common: [], totalCount: 0 };
    }
  },
  
  /**
   * Load more results for a specific section ("Show more").
   * Returns only the requested section with items starting from offset.
   * 
   * @param query - The original search query
   * @param section - The section key to load more from
   * @param offset - Starting offset (e.g., 12 for second page if sectionLimit is 12)
   * @param sectionLimit - Max items to return (default 12)
   */
  async searchSection(
    query: string,
    section: SectionKey,
    offset: number,
    sectionLimit: number = 12,
    sessionId?: string
  ): Promise<FoodSearchResponse> {
    if (!query || query.trim().length < 2) {
      return { results: [], sections: [], totalReturned: 0, yourFoods: [], branded: [], common: [], totalCount: 0 };
    }

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        section,
        sectionOffset: offset.toString(),
        sectionLimit: sectionLimit.toString(),
      });

      const headers: HeadersInit = sessionId ? { 'x-session-id': sessionId } : {};
      const data = await apiFetch<FoodSearchResponse>(`/api/foods/search?${params}`, { headers });
      return parseSearchResponse(data);
    } catch (error) {
      console.error('[foodService.searchSection] Error:', error);
      return { results: [], sections: [], totalReturned: 0, yourFoods: [], branded: [], common: [], totalCount: 0 };
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

  /**
   * List all favorited foods for the current user.
   */
  async listFavorites(): Promise<FoodObject[]> {
    try {
      const data = await apiFetch<{ foods: FoodObject[] }>('/api/foods/favorites');
      return data.foods.map(parseFoodObject);
    } catch (error) {
      console.error('[foodService.listFavorites] Error:', error);
      return [];
    }
  },

  /**
   * Log a client-side search event (fire-and-forget).
   * Does not throw — failures are silently swallowed.
   */
  logSearchEvent(payload: {
    event_type: 'search_result_selected' | 'search_abandoned';
    session_id?: string;
    query?: string;
    selected_food_id?: string;
    selected_food_source?: FoodResultSource;
    selected_result_position?: number;
    page_context?: string;
    [key: string]: unknown;
  }): void {
    fetch('/api/foods/search-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* non-fatal */ });
  },

  /**
   * Set or toggle favorite status for a food.
   * @param foodObjectId The food to favorite/unfavorite
   * @param isFavorite If provided, sets explicit value; otherwise toggles
   * @returns The new favorite status
   */
  async setFavorite(foodObjectId: string, isFavorite?: boolean): Promise<boolean> {
    try {
      const body: { foodObjectId: string; isFavorite?: boolean } = { foodObjectId };
      if (typeof isFavorite === 'boolean') {
        body.isFavorite = isFavorite;
      }

      const data = await apiFetch<{ isFavorite: boolean }>('/api/foods/favorites', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return data.isFavorite;
    } catch (error) {
      console.error('[foodService.setFavorite] Error:', error);
      throw error;
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
