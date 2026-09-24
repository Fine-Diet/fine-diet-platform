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

  it('keeps workspace shell mobile sheet classes and lg-only workspace overrides', () => {
    const source = read('components/food/itemManagement/ItemManagementDialog.tsx');
    expect(source).toContain("shell === 'workspace'");
    expect(source).toContain('DEFAULT_PANEL_CLASS');
    expect(source).toContain('lg:max-w-[800px]');
    expect(source).toContain('lg:top-[var(--app-chrome-offset,2.25rem)]');
    expect(source).toContain('lg:static lg:mt-10');
    expect(source).toContain('lg:rounded-none lg:border-0 lg:bg-transparent');
  });
});
