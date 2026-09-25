import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('ItemManagementDialog default shell', () => {
  it('preserves the original Lists/Hauls dialog chrome', () => {
    const source = read('components/food/itemManagement/ItemManagementDialog.tsx');
    expect(source).toContain('DEFAULT_PANEL_CLASS');
    expect(source).toContain(
      'max-h-[min(90dvh,880px)] max-w-[760px]',
    );
    expect(source).toContain('DEFAULT_FOOTER_CLASS');
    expect(source).toContain(
      'sticky bottom-0 border-t border-white/[0.08] bg-[#211a14] px-5 py-4',
    );
  });

  it('keeps Lists/Hauls workspace on card shell below lg', () => {
    const source = read('components/food/itemManagement/ItemManagementDialog.tsx');
    const lists = read('components/food/lists/ListsItemEditor.tsx');
    const haul = read('components/food/hauls/HaulItemEditor.tsx');
    expect(lists).toContain('shell="workspace"');
    expect(haul).toContain('shell="workspace"');
    expect(source).toContain("shell === 'workspace'");
    expect(source).toContain('WORKSPACE_PANEL_CLASS');
    expect(source).toContain('DEFAULT_PANEL_CLASS');
    expect(source).toContain('WORKSPACE_BODY_CLASS');
    expect(source).toContain('lg:px-8');
    expect(source).toMatch(
      /const WORKSPACE_PANEL_CLASS = cn\(\s*DEFAULT_PANEL_CLASS/,
    );
  });

  it('isolates Pantry pantry-workspace geometry from Lists/Hauls workspace', () => {
    const source = read('components/food/itemManagement/ItemManagementDialog.tsx');
    const pantry = read('components/food/pantry/PantryPurchaseEditor.tsx');
    expect(pantry).toContain('shell="pantry-workspace"');
    expect(source).toContain("shell === 'pantry-workspace'");
    expect(source).toContain('PANTRY_WORKSPACE_PANEL_CLASS');
    expect(source).toContain('PANTRY_WORKSPACE_OVERLAY_CLASS');
    expect(source).toContain('PANTRY_WORKSPACE_BODY_CLASS');
    expect(source).toContain('px-[30px]');
    expect(source).toContain('bg-transparent p-0 shadow-none');
    expect(source).toContain('lg:w-[800px]');
    expect(source).toContain('lg:max-w-[800px]');
    expect(source).toContain('bg-neutral-900/90 backdrop-blur-md');
    expect(source).not.toMatch(
      /PANTRY_WORKSPACE_PANEL_CLASS[\s\S]*bg-\[#211a14\]/,
    );
  });
});
