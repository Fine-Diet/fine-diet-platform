import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 13A founder remediation holds', () => {
  it('renders planning nutrition with explicit unavailable semantics', () => {
    const module = read('components/plans/home/MealGuidanceModule.tsx');
    const guidance = read('lib/plans/home/buildGuidance.ts');
    const view = read('components/plans/home/PlansHomeView.tsx');

    expect(module).toContain("NDS {model.projectedNds == null ? '—'");
    expect(module).toContain("model.dailyCalorieGoal == null ? '—'");
    expect(guidance).toContain('meal.meal_derived_data');
    expect(guidance).toContain('meal.payload');
    expect(guidance).not.toMatch(/journalEntryId.*Calories|journal_entries/);
    expect(view).toContain('planService.getLiveSnapshot()');
    expect(view).toContain('snapshot.targets.daily_calorie_goal');
  });

  it('opens the reusable full-screen planning composer instead of legacy create-meal', () => {
    const view = read('components/plans/home/PlansHomeView.tsx');
    const dialog = read('components/plans/home/PlanningMealComposerDialog.tsx');
    const shell = read('components/meals/composer/FullScreenMealComposerShell.tsx');

    expect(view).toContain('<PlanningMealComposerDialog');
    expect(view).not.toContain('buildPlansHomeCreateMealHref');
    expect(dialog).toContain('<PlanMealComposerPanel');
    expect(dialog).toContain('primaryLabel="Save"');
    expect(dialog).not.toMatch(/executeMeal|journal_entries|log_meal/);
    expect(shell).toContain('<AppDialog');
    expect(shell).toContain('h-[100dvh]');
  });

  it('uses an owner-safe dated target command without lifecycle mutation', () => {
    const service = read('lib/plans/plansHomeTargetServerService.ts');
    const api = read('pages/api/journal/plans/home/target.ts');
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');

    expect(service).toContain('selectPlansHomePlanningTarget');
    expect(service).toContain('createManualPlanForPerson');
    expect(service).toContain('ensurePlanOccasionStructureForPerson');
    expect(service).toContain('allowWritableDatedDayPlan: true');
    expect(service).not.toMatch(/activatePlan|archivePlan|updatePlan\(/);
    expect(api).toContain('requireCallerJournalAccess');
    expect(panel).toContain('planService.createMeal');
    expect(panel).not.toContain('planService.executeMeal');
    expect(panel).not.toContain("fetch('/api/journal");
  });

  it('keeps Add meal hidden at rest and reveals it for hover, focus, or tap', () => {
    const module = read('components/plans/home/MealGuidanceModule.tsx');
    expect(module).toContain('revealedEmptyKey');
    expect(module).toContain('onMouseEnter');
    expect(module).toContain('onFocusCapture');
    expect(module).toContain('onClick={(event)');
    expect(module).toContain(') : active ? (');
    expect(module).toContain('Add meal');
  });

  it('preserves safe action and scope boundaries', () => {
    const module = read('components/plans/home/MealGuidanceModule.tsx');
    const view = read('components/plans/home/PlansHomeView.tsx');
    expect(module).toContain("row.state === 'eaten'");
    expect(module).toContain('Open Log entry');
    expect(module).toContain('Quick Log');
    expect(view).toContain('buildPlansHomeLogHref');
    expect(view).not.toContain('executeMeal(');
    expect(fs.existsSync(path.join(process.cwd(), 'pages/app/plans/month.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'pages/app/plans/month/index.tsx'))).toBe(false);
  });
});
