import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '../baselineDay0To21Candidate';
import { SYNTHETIC_PROGRAM_BLUEPRINT } from '../programBlueprintExamples';
import { contrastRatio, parseProgramBlueprint } from '../programBlueprint';

describe('Program Blueprint v1', () => {
  it('adapts Baseline identity, all 22 days, authored modules and interaction policies', () => {
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.version.key).toBe('baseline-day-0-21-candidate');
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.modules).toHaveLength(50);
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.days.map((day) => day.day)).toEqual(Array.from({ length: 22 }, (_, day) => day));
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.phases).toHaveLength(4);
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.interactions.observations).toHaveLength(21);
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.interactions.checkIns.map((checkin) => checkin.day)).toEqual([7, 14, 21]);
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.interactions.completion.calendarAdvance).toBe('never');
    expect(BASELINE_DAY_0_TO_21_BLUEPRINT.phases[1].label).toBe('Week One · Rhythm');
  });

  it('uses the same generic delivery module contract for a differently themed and shorter synthetic program', () => {
    expect(SYNTHETIC_PROGRAM_BLUEPRINT.identity.slug).not.toBe(BASELINE_DAY_0_TO_21_BLUEPRINT.identity.slug);
    expect(SYNTHETIC_PROGRAM_BLUEPRINT.version.durationDays).toBe(5);
    expect(SYNTHETIC_PROGRAM_BLUEPRINT.days).toHaveLength(6);
    expect(SYNTHETIC_PROGRAM_BLUEPRINT.presentation.tokens.darkSurface)
      .not.toBe(BASELINE_DAY_0_TO_21_BLUEPRINT.presentation.tokens.darkSurface);
    expect(SYNTHETIC_PROGRAM_BLUEPRINT.modules.every((module) => module.programSlug === SYNTHETIC_PROGRAM_BLUEPRINT.identity.slug)).toBe(true);
    expect(SYNTHETIC_PROGRAM_BLUEPRINT.modules.some((module) => module.moduleType === 'practice_card')).toBe(true);
  });

  it('rejects missing day positions and theme pairs below WCAG AA text contrast', () => {
    const missingDay = structuredClone(BASELINE_DAY_0_TO_21_BLUEPRINT);
    missingDay.days = missingDay.days.filter((day) => day.day !== 9);
    expect(() => parseProgramBlueprint(missingDay)).toThrow(/each day from 0 through duration/);
    expect(contrastRatio('#777777', '#808080')).toBeLessThan(4.5);
    const unreadableTheme = structuredClone(BASELINE_DAY_0_TO_21_BLUEPRINT);
    unreadableTheme.presentation.tokens.darkForeground = '#777777';
    expect(() => parseProgramBlueprint(unreadableTheme)).toThrow(/contrast must be at least 4.5/);
  });
});
