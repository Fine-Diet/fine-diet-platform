/**
 * Plans — Client-Side Service (Phase 2)
 *
 * Fetch wrappers for the /api/journal/plans/** routes. Mirrors the style
 * of lib/journal/journalService.ts — thin, typed, no global state.
 *
 * Safe to import from client components.
 */

import type {
  Plan,
  PlanDay,
  PlanSlot,
  PlannedMeal,
  PlanShape,
} from './types';
import type {
  AiSubstitutionResponse,
} from './validators';

// ============================================================================
// Shared fetch helper
// ============================================================================

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.error === 'string' ? body.error : undefined;
    } catch {
      // ignore
    }
    throw new Error(detail ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ============================================================================
// Types
// ============================================================================

export interface PlanListResponse {
  plans: Plan[];
}

export interface PlanDetailResponse {
  plan: Plan;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
}

export interface GeneratePlanRequest {
  plan_shape: PlanShape;
  start_date: string;
  end_date?: string | null;
  user_prompt?: string | null;
}

export interface RegenerateSlotRequest {
  planned_meal_id: string;
  constraints?: {
    prefer_higher_subscore?:
      | 'wfr_10'
      | 'ps_10'
      | 'pnd_10'
      | 'fp_10'
      | 'as_10'
      | 'mnc_10'
      | 'ob_10'
      | null;
    avoid?: string[];
    max_calories?: number;
  };
}

export interface RegenerateSlotResponse {
  top: AiSubstitutionResponse;
  alternates: AiSubstitutionResponse[];
}

// ============================================================================
// Service
// ============================================================================

export const planService = {
  async list(): Promise<Plan[]> {
    const res = await request<PlanListResponse>('/api/journal/plans');
    return res.plans;
  },

  async getDetail(planId: string): Promise<PlanDetailResponse> {
    return await request<PlanDetailResponse>(`/api/journal/plans/${planId}`);
  },

  async archive(planId: string): Promise<Plan> {
    const res = await request<{ plan: Plan }>(`/api/journal/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    return res.plan;
  },

  async delete(planId: string): Promise<void> {
    await request(`/api/journal/plans/${planId}`, { method: 'DELETE' });
  },

  async generate(req: GeneratePlanRequest): Promise<PlanDetailResponse> {
    return await request<PlanDetailResponse>('/api/journal/plans/ai/generate', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async regenerateSlot(req: RegenerateSlotRequest): Promise<RegenerateSlotResponse> {
    return await request<RegenerateSlotResponse>(
      '/api/journal/plans/ai/regenerate-slot',
      { method: 'POST', body: JSON.stringify(req) },
    );
  },

  async updateMeal(
    mealId: string,
    patch: Partial<Pick<PlannedMeal, 'name' | 'meal_type' | 'payload'>>,
  ): Promise<PlannedMeal> {
    const res = await request<{ meal: PlannedMeal }>(
      `/api/journal/plans/meals/${mealId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.meal;
  },

  async deleteMeal(mealId: string): Promise<void> {
    await request(`/api/journal/plans/meals/${mealId}`, { method: 'DELETE' });
  },

  async replaceMeal(
    mealId: string,
    replacement: AiSubstitutionResponse['replacement_meal'],
  ): Promise<PlannedMeal> {
    const res = await request<{ meal: PlannedMeal }>(
      `/api/journal/plans/meals/${mealId}`,
      { method: 'PATCH', body: JSON.stringify({ ai_replacement: replacement }) },
    );
    return res.meal;
  },
};
