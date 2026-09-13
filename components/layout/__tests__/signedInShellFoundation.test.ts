import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('signed-in shell foundation', () => {
  const geometry = () => read('components/layout/SignedInPageShell.tsx');

  it('codifies the existing desktop drawer and top-chrome geometry', () => {
    const source = geometry();
    expect(source).toContain("'lg:pl-[250px]'");
    expect(source).toContain("'lg:left-[250px]'");
    expect(source).toContain("'var(--app-chrome-offset, 2.25rem)'");
  });

  it('reserves footer, safe-area, and optional local-action clearance', () => {
    const source = geometry();
    expect(source).toContain('var(--app-footer-clearance,7rem)');
    expect(source).toContain('env(safe-area-inset-bottom,0px)');
    expect(source).toContain('var(--app-local-fixed-action-height,0px)');
    expect(source).toContain('localFixedActionHeight');
  });

  it('keeps local content widths outside the outer shell contract', () => {
    const source = geometry();
    expect(source).not.toContain('max-w-[650px]');
    expect(source).not.toContain('max-w-[950px]');
  });

  it('preserves the five existing footer tabs with no Quick Entry', () => {
    const source = read('components/journal/JournalFooterNav.tsx');
    for (const label of ['Home', 'Programs', 'Log', 'Plans', 'Food']) {
      expect(source).toContain(`label: '${label}'`);
    }
    expect(source).not.toContain("label: 'Quick Entry'");
  });

  it('uses the shared drawer-offset tokens without changing their values', () => {
    const shell = read('components/journal/AppShell.tsx');
    const footer = read('components/journal/JournalFooterNav.tsx');
    expect(shell).toContain('SIGNED_IN_DESKTOP_DRAWER_OFFSET_CLASS');
    expect(footer).toContain('SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS');
  });
});

describe('shared accessible dialog and sheet foundation', () => {
  it('supports dialog and sheet presentation at the app overlay stacking level', () => {
    const source = read('components/ui/AppDialog.tsx');
    expect(source).toContain("AppDialogPresentation = 'dialog' | 'sheet'");
    expect(source).toContain("'fixed inset-0 z-[90]");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('env(safe-area-inset-bottom,0px)');
  });

  it('supports focus containment/restoration, Escape, inert, and scroll locking', () => {
    const source = read('components/ui/useAccessibleDialog.ts');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("event.key !== 'Tab'");
    expect(source).toContain('previouslyFocused.focus()');
    expect(source).toContain("document.body.style.overflow = 'hidden'");
    expect(source).toContain("inertTarget.setAttribute('inert', '')");
  });

  it('proves both established full-content overlays use shared behavior', () => {
    const mealRhythm = read('components/plans/rhythm/MealRhythmOverlay.tsx');
    const nutritionTargets = read(
      'components/nutrition/targets/NutritionTargetsOverlay.tsx',
    );
    expect(mealRhythm).toContain('useAccessibleDialog');
    expect(nutritionTargets).toContain('useAccessibleDialog');
    expect(mealRhythm).toContain('lockBodyScroll: false');
    expect(nutritionTargets).toContain('lockBodyScroll: false');
  });
});
