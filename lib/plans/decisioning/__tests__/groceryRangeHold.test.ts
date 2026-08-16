import fs from 'fs';
import path from 'path';

/**
 * Packet 1 hold: do not narrow or replace week/custom-range grocery generation.
 * This pins the live API contract so a later edit cannot drop date_end silently.
 */
describe('grocery generate range hold', () => {
  it('keeps date + optional date_end on the generate API', () => {
    const filePath = path.join(
      process.cwd(),
      'pages/api/journal/plans/[planId]/grocery/generate.ts',
    );
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).toContain('date_end?: string');
    expect(source).toContain('dateStart');
    expect(source).toContain('dateEnd');
    expect(source).toContain("date_end must be on or after date.");
  });
});
