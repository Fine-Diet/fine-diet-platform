import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Food UI polish pass 1 geometry', () => {
  it('counts chrome once from the measured header instead of the clipped h-9 offset', () => {
    const nav = read('components/journal/AppTopNav.tsx');
    const shell = read('components/journal/AppShell.tsx');
    const drawer = read('components/journal/AppSideMenu.tsx');
    expect(nav).toContain('data-app-top-nav');
    expect(nav).toContain('box-content flex h-8');
    expect(nav).toContain('py-6');
    expect(nav).not.toContain('h-9');
    expect(shell).toContain("'--app-chrome-offset'");
    expect(shell).toContain('ResizeObserver');
    expect(shell).toContain('APP_CHROME_OFFSET_CLASS');
    expect(shell).not.toContain("'pt-9'");
    expect(drawer).toContain('lg:top-[var(--app-chrome-offset,calc(5rem+1px))]');
    expect(drawer).not.toContain('lg:top-9');
  });

  it('opts Food modals into the content pane without changing the default dialog frame', () => {
    const dialog = read('components/ui/AppDialog.tsx');
    const food = read('components/food/itemManagement/ItemManagementDialog.tsx');
    const pantry = read('components/food/pantry/PantryManager.tsx');
    expect(dialog).toContain("'fixed inset-0 z-[90] flex justify-center bg-black/70 backdrop-blur-sm'");
    expect(dialog).toContain('FOOD_CONTENT_PANE_FRAME_CLASS');
    expect(dialog).toContain('createPortal');
    expect(food).toContain('contentPane');
    expect(food).toContain('app-chrome-offset');
    expect(food).not.toContain('max-lg:top-0');
    expect(pantry).toContain('contentPane');
    expect(pantry).toContain('Search foods');
  });

  it('expands recipe choices in flow and keeps the three destinations', () => {
    const menu = read('components/food/home/RecipeEntryMenu.tsx');
    expect(menu).toContain('mt-2 rounded-[20px]');
    expect(menu).not.toContain('absolute inset-x-0');
    expect(menu).toContain('Create from scratch');
    expect(menu).toContain('Copy & paste text');
    expect(menu).toContain('Import from a link');
    expect(menu).toContain("event.key === 'Escape'");
  });

  it('moves Haul summary clearance inside the bordered owner and rounds the store plus', () => {
    const haul = read('components/food/hauls/HaulBuilder.tsx');
    expect(haul).toContain('reserveFooter={!showPreparationSummary}');
    expect(haul).toContain('data-shopping-summary');
    expect(haul).toContain('SIGNED_IN_FOOTER_CLEARANCE_CLASS');
    expect(haul).toContain('rounded-t-[24px] border border-b-0');
    expect(haul).toContain('rounded-tr-[12px]');
    expect(haul).toContain('rounded-tl-[12px]');
    expect(haul).toContain('aria-hidden');
    expect(haul).not.toContain('onClick={() => setSummaryMenuOpen');
  });
});
