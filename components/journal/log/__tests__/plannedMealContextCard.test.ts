import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    'components/journal/log/PlannedMealContextCard.tsx',
  ),
  'utf8',
);

describe('Packet 14B Planned Meal context card boundary', () => {
  it('uses the canonical dated Plan resolver instead of a Log-only active filter', () => {
    expect(source).toContain('resolvePlannedMealContext(');
    expect(source).not.toContain("p.status === 'active'");
  });

  it('keeps retrieval diagnostics internal and development-only', () => {
    expect(source).toContain('setRetrievalDiagnostic(result.diagnostic)');
    expect(source).toContain("process.env.NODE_ENV !== 'production'");
    expect(source).toContain(
      '[PlannedMealContextCard] planned context retrieval failed',
    );
    expect(source).not.toContain('result.diagnostic.message}</');
  });

  it('contains no journal write path during context resolution', () => {
    expect(source).not.toContain('journalService');
    expect(source).not.toContain('/api/journal/entries');
    expect(source).not.toContain('commitNutritionDraft');
  });

  it('normalizes handled execution copy without exposing the internal eaten label', () => {
    expect(source).toContain("return { label: 'Logged', already: 'Already logged' }");
    expect(source).toContain("return { label: 'Skipped', already: 'Already skipped' }");
    expect(source).toContain('${execution.already}.');
    expect(source).not.toContain('Already ${meal.execution_state}');
    expect(source).not.toContain('Already eaten');
  });
});
