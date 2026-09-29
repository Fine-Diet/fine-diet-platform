import fs from 'fs';
import path from 'path';

import {
  canMutateHaulContributorItem,
  contributorNamesFromInvitations,
  isHaulContributorOriginItem,
} from '@/lib/plans/groceryHaul/haulBuilderCollaboration';
import type { GroceryHaulItem } from '@/lib/plans/types';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

function contributorItem(overrides: Partial<GroceryHaulItem> = {}): GroceryHaulItem {
  return {
    id: 'item-1',
    haul_id: 'haul-1',
    person_id: 'owner',
    name_snapshot: 'Bananas',
    quantity_snapshot: 2,
    unit_snapshot: 'bunch',
    final_quantity: 2,
    source_status_snapshot: 'pending',
    origin_type: 'haul_contributor',
    added_by_person_id: 'person-alice',
    source_grocery_list_id: null,
    ...overrides,
  } as GroceryHaulItem;
}

describe('Invite to Haul B2 UI contracts', () => {
  it('routes accepted landing into the shared Haul when haul_id is present', () => {
    const landing = read('app/haul-invitations/[invitationId]/page.tsx');
    expect(landing).toContain('APP_ROUTE_BUILDERS.foodHaul(outcome.haulId)');
    expect(APP_ROUTE_BUILDERS.foodHaul('haul-1')).toBe('/app/food/hauls/haul-1');
  });

  it('wires invite dialog create/resend/revoke through planService', () => {
    const dialog = read('components/food/hauls/HaulInviteDialog.tsx');
    expect(dialog).toContain('planService.createHaulInvitation');
    expect(dialog).toContain('deliver: false');
    expect(dialog).toContain('Copy invite link');
    expect(dialog).toContain('buildHaulInviteLandingUrl');
    expect(dialog).toContain('planService.resendHaulInvitation');
    expect(dialog).toContain('planService.revokeHaulInvitation');
    expect(dialog).toContain('duplicate_pending');
    expect(dialog).toContain('already_member');
    expect(dialog).toContain("result.email === 'failed'");
    expect(dialog).not.toContain('create_grocery_haul_invitation');
  });

  it('loads contributor Hauls through the shared read when owner detail is missing', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(builder).toContain('getSharedGroceryHaul');
    expect(builder).toContain('viewerRole');
    expect(builder).toContain('getGroceryHaul(haulId)');
  });

  it('hides owner-only builder controls from contributors', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(builder).toContain('{isOwner && !activePrepareView &&');
    expect(builder).toContain('{isOwner && (');
    expect(builder).toContain('HaulInviteDialog');
    expect(builder).toMatch(/viewerRole === 'contributor'/);
  });

  it('limits contributor item mutations to own haul-only rows while Draft', () => {
    const item = contributorItem();
    expect(isHaulContributorOriginItem(item)).toBe(true);
    expect(
      canMutateHaulContributorItem(item, { role: 'contributor', personId: 'person-alice' }, 'planned'),
    ).toBe(true);
    expect(
      canMutateHaulContributorItem(item, { role: 'contributor', personId: 'person-bob' }, 'planned'),
    ).toBe(false);
    expect(
      canMutateHaulContributorItem(item, { role: 'owner', personId: 'owner' }, 'planned'),
    ).toBe(true);
    expect(
      canMutateHaulContributorItem(item, { role: 'contributor', personId: 'person-alice' }, 'active'),
    ).toBe(false);
  });

  it('keeps attribution names after an invitation is revoked', () => {
    const names = contributorNamesFromInvitations([
      {
        invited_person_id: 'person-alice',
        invited_display_name: 'Alice A',
      },
    ]);
    expect(names.get('person-alice')).toBe('Alice A');
  });

  it('uses contributor-items API for haul-only edits', () => {
    const dialog = read('components/food/hauls/HaulContributorItemDialog.tsx');
    expect(dialog).toContain('planService.updateHaulContributorItem');
    expect(dialog).toContain('planService.addHaulContributorItem');
    expect(dialog).not.toContain('updateGroceryHaulItem');
  });
});
