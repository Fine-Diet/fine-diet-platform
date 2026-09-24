import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('ItemManagementDialog default shell', () => {
  it('preserves the original Lists/Hauls dialog chrome', () => {
    const source = read('components/food/itemManagement/ItemManagementDialog.tsx');
    expect(source).toContain(
      "'flex max-h-[min(90dvh,880px)] max-w-[760px] flex-col border border-white/10 bg-[#211a14] p-0 shadow-2xl'",
    );
    expect(source).toContain(
      '"sticky bottom-0 border-t border-white/[0.08] bg-[#211a14] px-5 py-4"',
    );
  });
});
