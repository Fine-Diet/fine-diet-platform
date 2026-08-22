/**
 * Overlay layering / dismiss affordance holds for Meal Rhythm v2B corrections.
 */

import fs from 'fs';
import path from 'path';

describe('MealRhythmOverlay correction holds', () => {
  const overlayPath = path.join(
    process.cwd(),
    'components/plans/rhythm/MealRhythmOverlay.tsx',
  );
  const shellPath = path.join(process.cwd(), 'components/journal/AppShell.tsx');

  it('B1: content-area left uses responsive class without inline left:0 override', () => {
    const src = fs.readFileSync(overlayPath, 'utf8');
    expect(src).toContain("MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS = 'left-0 lg:left-[250px]'");
    expect(src).toContain('MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS');
    // Must not reintroduce the bug: class lg:left + style left:0
    expect(src).not.toMatch(/style=\{\{\s*top:\s*topOffset,\s*left:\s*0\s*\}\}/);
    expect(src).toMatch(/style=\{\{\s*top:\s*topOffset\s*\}\}/);
  });

  it('B4: exposes explicit close for non-confirm states and keeps Done on confirm', () => {
    const src = fs.readFileSync(overlayPath, 'utf8');
    expect(src).toContain('aria-label="Close meal rhythm"');
    expect(src).toContain('showClose = ctrl.phase !== \'confirm\'');
    expect(src).toContain('dismissWithoutSave');
  });

  it('B3: AppShell marks background chrome inert while overlay is open', () => {
    const src = fs.readFileSync(shellPath, 'utf8');
    expect(src).toContain('inert');
    expect(src).toContain('backgroundInertProps');
    expect(src).toContain('mealRhythmOpen');
  });

  it('overlay scroll container hides scrollbar like AppSideMenu while keeping overflow-y-auto', () => {
    const src = fs.readFileSync(overlayPath, 'utf8');
    expect(src).toContain('overflow-y-auto');
    expect(src).toContain('[-ms-overflow-style:none]');
    expect(src).toContain('[scrollbar-width:none]');
    expect(src).toContain('[&::-webkit-scrollbar]:hidden');
  });

  it('footer/bottom nav drops under Meal Rhythm overlay while open (not above it)', () => {
    const footerPath = path.join(process.cwd(), 'components/journal/JournalFooterNav.tsx');
    const footer = fs.readFileSync(footerPath, 'utf8');
    const overlay = fs.readFileSync(overlayPath, 'utf8');
    expect(footer).toContain('useMealRhythmOverlay');
    expect(footer).toContain("mealRhythmOpen ? 'z-[40]' : 'z-[70]'");
    // Overlay stays below topnav (z-[60]) — do not escalate overlay over topnav
    expect(overlay).toContain('z-[51]');
    expect(overlay).not.toMatch(/z-\[(6[1-9]|[7-9]\d|[1-9]\d{2,})\]/);
  });
});
