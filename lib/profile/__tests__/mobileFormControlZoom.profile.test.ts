import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Profile mobile form control zoom (Pass 1)', () => {
  it('uses text-xl on shared Profile input and select classes', () => {
    const profile = read('pages/journal/profile.tsx');
    expect(profile).toMatch(/const inputClass =[\s\S]{0,220}text-xl/);
    expect(profile).toMatch(/const selectClass =[\s\S]{0,220}text-xl/);
    expect(profile).not.toMatch(/const inputClass =[\s\S]{0,220}text-sm/);
    expect(profile).not.toMatch(/const selectClass =[\s\S]{0,220}text-sm/);
  });

  it('uses text-xl on MealRhythmEditor editable controls', () => {
    const rhythm = read('components/plans/rhythm/MealRhythmEditor.tsx');
    expect(rhythm).toContain('py-2.5 text-xl text-white placeholder-white/30');
    expect(rhythm).toContain('py-2.5 text-xl text-white disabled:opacity-40');
    expect(rhythm).not.toMatch(/<input[\s\S]*?text-sm/);
  });

  it('uses text-xl on MacroTargetAllocator editable controls', () => {
    const allocator = read('components/nutrition/targets/MacroTargetAllocator.tsx');
    expect(allocator).toMatch(/Daily caloric goal[\s\S]{0,320}text-xl/);
    expect(allocator).toMatch(/bg-transparent text-xl text-brand-50/);
    expect(allocator).not.toMatch(/type="number"[\s\S]{0,200}text-sm/);
  });

  it('uses text-xl on profile-reachable NutritionTargetsEditor inputs', () => {
    const editor = read('components/nutrition/targets/NutritionTargetsEditor.tsx');
    expect(editor).toMatch(/const inputClass =[\s\S]{0,220}text-xl/);
    expect(editor).not.toMatch(/const inputClass =[\s\S]{0,220}text-sm/);
  });
});
