import {
  saveNutritionTargets,
  validateNutritionTargetsSave,
  resolveOptionalMacroInputs,
  type NutritionTargetsSaveInput,
} from '../save';

describe('resolveOptionalMacroInputs (review item: macro_optional_semantics)', () => {
  it('resolves to null (unset) when all three fields are blank', () => {
    expect(resolveOptionalMacroInputs({ protein_g: '', carbs_g: '', fat_g: '' })).toEqual({
      ok: true,
      macroGoals: null,
    });
  });

  it('resolves to a fully-specified MacroGoals when all three fields are filled', () => {
    expect(resolveOptionalMacroInputs({ protein_g: '150', carbs_g: '200', fat_g: '70' })).toEqual({
      ok: true,
      macroGoals: { protein_g: 150, carbs_g: 200, fat_g: 70 },
    });
  });

  it('rejects a partial fill instead of synthesizing 0 for the blank fields', () => {
    const result = resolveOptionalMacroInputs({ protein_g: '150', carbs_g: '', fat_g: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/all three/i);
    }
  });

  it('rejects a partial fill even when exactly two of three are filled', () => {
    const result = resolveOptionalMacroInputs({ protein_g: '150', carbs_g: '200', fat_g: '' });
    expect(result.ok).toBe(false);
  });

  it('never derives a missing macro from another field — 0 is a valid explicit value, not a placeholder', () => {
    expect(resolveOptionalMacroInputs({ protein_g: '0', carbs_g: '0', fat_g: '0' })).toEqual({
      ok: true,
      macroGoals: { protein_g: 0, carbs_g: 0, fat_g: 0 },
    });
  });

  it('rejects non-numeric or negative entries', () => {
    expect(resolveOptionalMacroInputs({ protein_g: 'abc', carbs_g: '200', fat_g: '70' }).ok).toBe(false);
    expect(resolveOptionalMacroInputs({ protein_g: '-5', carbs_g: '200', fat_g: '70' }).ok).toBe(false);
  });
});

describe('validateNutritionTargetsSave', () => {
  it('accepts a plausible calorie target with no macros', () => {
    expect(validateNutritionTargetsSave({ dailyCalorieGoal: 2200, macroGoals: null })).toEqual({ ok: true });
  });

  it('accepts a plausible calorie target with all-zero-or-positive macros', () => {
    expect(
      validateNutritionTargetsSave({
        dailyCalorieGoal: 2200,
        macroGoals: { protein_g: 150, carbs_g: 0, fat_g: 60 },
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a calorie target below the safety floor', () => {
    const result = validateNutritionTargetsSave({ dailyCalorieGoal: 100, macroGoals: null });
    expect(result.ok).toBe(false);
  });

  it('rejects a calorie target above the safety ceiling', () => {
    const result = validateNutritionTargetsSave({ dailyCalorieGoal: 50000, macroGoals: null });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-finite calorie target', () => {
    expect(validateNutritionTargetsSave({ dailyCalorieGoal: NaN, macroGoals: null }).ok).toBe(false);
  });

  it('rejects negative macro values', () => {
    const result = validateNutritionTargetsSave({
      dailyCalorieGoal: 2200,
      macroGoals: { protein_g: -10, carbs_g: 200, fat_g: 60 },
    });
    expect(result.ok).toBe(false);
  });
});

describe('saveNutritionTargets', () => {
  // Note: `macroGoals` is deliberately omitted from this baseInput (rather
  // than set to `null`) so it represents "this save doesn't concern macros
  // at all" — see the macroGoals doc comment on NutritionTargetsSaveInput.
  const baseInput: NutritionTargetsSaveInput = {
    dailyCalorieGoal: 2200,
    source: 'user_confirmed',
    estimatedCalories: 2200,
    modelVersion: 'nasem_eer_2023.adult.v1',
    activityBaseline: 'moderately_active',
    bodyInputsUsedAt: { age_years: 30, sex: 'male', height_cm: 178, weight_kg: 75 },
  };

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  it('does not call fetch at all when validation fails (fails closed)', async () => {
    const result = await saveNutritionTargets({ ...baseInput, dailyCalorieGoal: 1 });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes only to the canonical /api/journal/goals endpoint when activity was already known', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const result = await saveNutritionTargets(baseInput);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/journal/goals');
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body);
    expect(body.dailyCalorieGoal).toBe(2200);
    expect(body.provenance.source).toBe('user_confirmed');
    expect(body.provenance.activityBaseline).toBe('moderately_active');
  });

  it('includes macroGoals in the payload only when the caller provided them (optional macros)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await saveNutritionTargets({
      ...baseInput,
      macroGoals: { protein_g: 150, carbs_g: 200, fat_g: 70 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.macroGoals).toEqual({ protein_g: 150, carbs_g: 200, fat_g: 70 });
  });

  // Review item "clear_existing_macros": omitting `macroGoals` entirely and
  // passing an explicit `null` must produce different wire behavior — only
  // `null` may clear an already-stored macroGoals.
  describe('macroGoals tri-state (review item: clear_existing_macros)', () => {
    it('omits macroGoals from the request body entirely when the caller does not mention it (leaves any stored value untouched)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      await saveNutritionTargets(baseInput); // no macroGoals key at all
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect('macroGoals' in body).toBe(false);
    });

    it('sends an explicit macroGoals: null in the request body as a clear signal (never silently omitted)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      await saveNutritionTargets({ ...baseInput, macroGoals: null });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect('macroGoals' in body).toBe(true);
      expect(body.macroGoals).toBeNull();
    });
  });

  it('persists a newly-confirmed activity baseline through the profile endpoint before saving goals', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true }); // profile POST
    fetchMock.mockResolvedValueOnce({ ok: true }); // goals PATCH
    const result = await saveNutritionTargets({
      ...baseInput,
      activityBaselineToPersist: 'moderately_active',
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/journal/profile');
    const profileBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(profileBody).toEqual({ activity_baseline: 'moderately_active' });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/journal/goals');
  });

  it('does not attempt the goals save if persisting the activity baseline fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const result = await saveNutritionTargets({
      ...baseInput,
      activityBaselineToPersist: 'moderately_active',
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a friendly error and does not throw when the goals save fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const result = await saveNutritionTargets(baseInput);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('nutrition targets') });
  });

  it('surfaces a friendly error and does not throw on a network exception', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const result = await saveNutritionTargets(baseInput);
    expect(result.ok).toBe(false);
  });
});
