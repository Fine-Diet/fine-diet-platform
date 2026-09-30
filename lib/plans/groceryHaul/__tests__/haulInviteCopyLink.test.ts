import fs from 'fs';
import path from 'path';

import {
  buildHaulInviteLandingPath,
  buildHaulInviteLandingUrl,
} from '@/lib/plans/groceryHaul/haulInviteLanding';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const INV_ID = '5b0a6d0e-2f0b-4d6e-9d3e-0c1f6f1d7a11';

describe('Haul invite copy-link contract', () => {
  it('builds recipient-bound landing URLs only from a validated invitation id', () => {
    const url = buildHaulInviteLandingUrl('https://myfinediet.com', INV_ID);
    expect(url).toBe(`https://myfinediet.com${buildHaulInviteLandingPath(INV_ID)}`);
    expect(url).not.toContain('/auth/callback');
    expect(url).not.toContain('?next=');
    expect(() => buildHaulInviteLandingUrl('https://myfinediet.com', '../evil')).toThrow();
  });

  it('uses deliver: false for copy-link creates in planService and the invite dialog', () => {
    const planService = read('lib/plans/planService.ts');
    const dialog = read('components/food/hauls/HaulInviteDialog.tsx');
    expect(planService).toContain('deliver: false');
    expect(dialog).toContain("createHaulInvitation(haulId, email.trim(), { deliver: false })");
    expect(dialog).toContain('Copy invite link');
    expect(dialog).toContain('buildHaulInviteLandingUrl(window.location.origin');
  });

  it('keeps resend as email delivery on the existing invitation row', () => {
    const dialog = read('components/food/hauls/HaulInviteDialog.tsx');
    expect(dialog).toContain('resendHaulInvitation');
    expect(dialog).toContain('{ deliver: false }');
    expect(dialog).toMatch(/createHaulInvitation\(haulId, email\.trim\(\)\);/);
  });
});
