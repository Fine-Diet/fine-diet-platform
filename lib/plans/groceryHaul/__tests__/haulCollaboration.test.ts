import { createFakeSupabase } from '@/lib/plans/__tests__/testSupabaseFake';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockInviteUserByEmail = jest.fn();
const mockGetUserById = jest.fn();
const mockGetGroceryHaulDetail = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      admin: {
        inviteUserByEmail: (...args: unknown[]) => mockInviteUserByEmail(...args),
        getUserById: (...args: unknown[]) => mockGetUserById(...args),
      },
    },
  },
}));

jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  getGroceryHaulDetail: (...args: unknown[]) => mockGetGroceryHaulDetail(...args),
}));

import {
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
} from '../service';
import {
  acceptHaulInvitation,
  addHaulContributorItem,
  buildHaulInviteRedirectPath,
  createHaulInvitation,
  getSharedGroceryHaulDetail,
  listHaulInvitationsForOwner,
  listPendingHaulInvitationsForPerson,
  mapCollaborationRpcError,
  normalizeInviteEmail,
  removeHaulContributorItem,
  resolveHaulViewerAccess,
  revokeHaulInvitation,
  updateHaulContributorItem,
} from '../haulCollaboration';
import {
  HAUL_CONTRIBUTOR_ITEM_ADD_RPC_NAME,
  HAUL_CONTRIBUTOR_ITEM_REMOVE_RPC_NAME,
  HAUL_CONTRIBUTOR_ITEM_UPDATE_RPC_NAME,
  HAUL_INVITE_ACCEPT_RPC_NAME,
  HAUL_INVITE_CREATE_RPC_NAME,
  HAUL_INVITE_REVOKE_RPC_NAME,
} from '../schema';

const OWNER = 'person-owner';
const ALICE = 'person-alice';
const BOB = 'person-bob';
const STRANGER = 'person-stranger';
const HAUL = 'haul-1';

function invitation(overrides: Record<string, unknown>) {
  return {
    id: 'inv-1',
    haul_id: HAUL,
    owner_person_id: OWNER,
    invited_email_normalized: 'alice@example.com',
    invited_person_id: ALICE,
    role: 'contributor',
    status: 'accepted',
    invited_at: '2026-09-01T00:00:00Z',
    accepted_at: '2026-09-02T00:00:00Z',
    revoked_at: null,
    ...overrides,
  };
}

function install(invitations: Array<Record<string, unknown>> = []) {
  const fake = createFakeSupabase({
    grocery_hauls: [
      { id: HAUL, person_id: OWNER, title: 'Weekend', shopping_date: '2026-09-10', status: 'planned' },
      { id: 'haul-other', person_id: STRANGER, title: 'Not yours', shopping_date: '2026-09-11', status: 'planned' },
    ],
    grocery_haul_invitations: invitations,
    people: [
      { id: OWNER, email: 'owner@example.com', first_name: 'Olive', last_name: 'Owner' },
      { id: ALICE, email: 'alice@example.com', first_name: 'Alice', last_name: 'A' },
      { id: BOB, email: 'bob@example.com', first_name: 'Bob', last_name: 'B' },
      { id: STRANGER, email: 'stranger@example.com', first_name: 'Sam', last_name: 'S' },
    ],
  });
  mockFrom.mockImplementation((table: string) => fake.from(table));
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockReset();
  mockInviteUserByEmail.mockReset();
  mockGetUserById.mockReset();
  mockGetGroceryHaulDetail.mockReset();
});

describe('normalizeInviteEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeInviteEmail('  Alice@Example.COM ')).toBe('alice@example.com');
  });

  it.each([undefined, null, 42, '', '   ', 'no-at-sign', 'a@b', 'a b@c.com', `${'a'.repeat(320)}@x.co`])(
    'rejects %p',
    (value) => {
      expect(() => normalizeInviteEmail(value)).toThrow(GroceryHaulValidationError);
    },
  );
});

describe('mapCollaborationRpcError', () => {
  const cases: Array<[string, new (message: string) => Error]> = [
    ['HAUL_INVITE_INVALID_EMAIL', GroceryHaulValidationError],
    ['HAUL_INVITE_INVALID_ARGS', GroceryHaulValidationError],
    ['HAUL_CONTRIBUTOR_INVALID_ARGS', GroceryHaulValidationError],
    ['HAUL_CONTRIBUTOR_INVALID_ITEM', GroceryHaulValidationError],
    ['HAUL_INVITE_SELF', GroceryHaulValidationError],
    ['HAUL_INVITE_LIMIT', GroceryHaulConflictError],
    ['HAUL_CONTRIBUTOR_ITEM_LIMIT', GroceryHaulConflictError],
    ['HAUL_INVITE_NOT_DRAFT', GroceryHaulConflictError],
    ['HAUL_CONTRIBUTOR_NOT_DRAFT', GroceryHaulConflictError],
    ['HAUL_INVITE_HAUL_NOT_OPEN', GroceryHaulConflictError],
    ['HAUL_INVITE_REVOKED', GroceryHaulConflictError],
    ['HAUL_INVITE_ACCOUNT_NOT_LINKED', GroceryHaulConflictError],
    ['HAUL_INVITE_NOT_FOUND', GroceryHaulNotFoundError],
    ['HAUL_CONTRIBUTOR_ITEM_NOT_FOUND', GroceryHaulNotFoundError],
    ['HAUL_INVITE_IDENTITY_MISMATCH', GroceryHaulForbiddenError],
    ['HAUL_INVITE_FORBIDDEN', GroceryHaulForbiddenError],
    ['HAUL_CONTRIBUTOR_FORBIDDEN', GroceryHaulForbiddenError],
  ];

  it.each(cases)('maps %s to a typed application error', (code, errorClass) => {
    expect(() => mapCollaborationRpcError({ message: code }, 'x')).toThrow(errorClass);
  });

  it('never leaks unknown database text through a typed error', () => {
    let thrown: unknown;
    try {
      mapCollaborationRpcError({ message: 'relation "secret_table" does not exist' }, 'Failed');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(GroceryHaulValidationError);
    expect(thrown).not.toBeInstanceOf(GroceryHaulConflictError);
    expect(thrown).not.toBeInstanceOf(GroceryHaulForbiddenError);
    expect(thrown).not.toBeInstanceOf(GroceryHaulNotFoundError);
  });
});

describe('resolveHaulViewerAccess (membership-aware role resolution)', () => {
  it('resolves the owner from grocery_hauls.person_id', async () => {
    install();
    await expect(resolveHaulViewerAccess(OWNER, HAUL)).resolves.toEqual({
      role: 'owner',
      haulId: HAUL,
      ownerPersonId: OWNER,
      actorPersonId: OWNER,
    });
  });

  it('resolves an accepted contributor and reports the OWNER as the data owner', async () => {
    install([invitation({ status: 'accepted' })]);
    await expect(resolveHaulViewerAccess(ALICE, HAUL)).resolves.toEqual({
      role: 'contributor',
      haulId: HAUL,
      ownerPersonId: OWNER,
      actorPersonId: ALICE,
    });
  });

  it.each(['pending', 'revoked'])('denies a %s invitee', async (status) => {
    install([invitation({ status, accepted_at: null, revoked_at: status === 'revoked' ? 'x' : null })]);
    await expect(resolveHaulViewerAccess(ALICE, HAUL)).resolves.toBeNull();
  });

  it('denies a stranger, a member of a different Haul, and an unknown Haul', async () => {
    install([invitation({ haul_id: 'haul-other', owner_person_id: STRANGER })]);
    await expect(resolveHaulViewerAccess(BOB, HAUL)).resolves.toBeNull();
    await expect(resolveHaulViewerAccess(ALICE, HAUL)).resolves.toBeNull();
    await expect(resolveHaulViewerAccess(ALICE, 'does-not-exist')).resolves.toBeNull();
  });
});

describe('createHaulInvitation', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const created = (linked: boolean, outcome = 'created') => ({
    data: {
      invitation_id: 'inv-9',
      haul_id: HAUL,
      status: 'pending',
      invited_email_normalized: 'new@example.com',
      invited_person_id: linked ? ALICE : null,
      invited_account_linked: linked,
      outcome,
    },
    error: null,
  });

  it('sends the session owner and a normalized email to the RPC, never a body person id', async () => {
    install();
    mockRpc.mockResolvedValue(created(true));
    await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: '  NEW@Example.com ' });
    expect(mockRpc).toHaveBeenCalledWith(HAUL_INVITE_CREATE_RPC_NAME, {
      p_actor_person_id: OWNER,
      p_haul_id: HAUL,
      p_email: 'new@example.com',
    });
  });

  it('sends a Supabase Auth invitation only for a newly created invite with no linked account', async () => {
    install();
    mockRpc.mockResolvedValue(created(false));
    mockInviteUserByEmail.mockResolvedValue({ data: {}, error: null });
    const result = await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'new@example.com' });
    expect(result.email).toBe('sent');
    expect(mockInviteUserByEmail).toHaveBeenCalledTimes(1);
    const [email, options] = mockInviteUserByEmail.mock.calls[0];
    expect(email).toBe('new@example.com');
    expect((options as { redirectTo: string }).redirectTo).toContain(
      buildHaulInviteRedirectPath('inv-9'),
    );
  });

  it('does not email an existing linked account or a duplicate / existing member', async () => {
    install();
    mockRpc.mockResolvedValue(created(true));
    expect((await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'a@b.co' })).email).toBe(
      'skipped_account_linked',
    );
    mockRpc.mockResolvedValue(created(false, 'duplicate_pending'));
    expect((await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'a@b.co' })).email).toBe(
      'skipped_not_created',
    );
    mockRpc.mockResolvedValue(created(true, 'already_member'));
    expect((await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'a@b.co' })).email).toBe(
      'skipped_not_created',
    );
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });

  it('keeps the invitation when the Auth email fails or the address is already registered', async () => {
    install();
    mockRpc.mockResolvedValue(created(false));
    mockInviteUserByEmail.mockResolvedValueOnce({ data: null, error: { message: 'smtp exploded' } });
    const failed = await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'new@example.com' });
    expect(failed.email).toBe('failed');
    expect(failed.invitation_id).toBe('inv-9');

    mockInviteUserByEmail.mockResolvedValueOnce({
      data: null,
      error: { message: 'A user with this email address has already been registered' },
    });
    const registered = await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'new@example.com' });
    expect(registered.email).toBe('already_registered');

    mockInviteUserByEmail.mockRejectedValueOnce(new Error('network down'));
    const threw = await createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'new@example.com' });
    expect(threw.email).toBe('failed');
  });

  it('rejects an invalid email before touching the database', async () => {
    install();
    await expect(
      createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'nope' }),
    ).rejects.toThrow(GroceryHaulValidationError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps database rejections (non-owner, non-Draft, self, limit)', async () => {
    install();
    for (const [code, errorClass] of [
      ['HAUL_INVITE_FORBIDDEN', GroceryHaulForbiddenError],
      ['HAUL_INVITE_NOT_DRAFT', GroceryHaulConflictError],
      ['HAUL_INVITE_SELF', GroceryHaulValidationError],
      ['HAUL_INVITE_LIMIT', GroceryHaulConflictError],
    ] as const) {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      await expect(
        createHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, email: 'x@y.co' }),
      ).rejects.toThrow(errorClass);
    }
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });
});

describe('revokeHaulInvitation', () => {
  it('forwards the session owner and reports the outcome', async () => {
    install();
    mockRpc.mockResolvedValue({ data: { invitation_id: 'inv-1', outcome: 'revoked' }, error: null });
    await expect(
      revokeHaulInvitation({ ownerPersonId: OWNER, haulId: HAUL, invitationId: 'inv-1' }),
    ).resolves.toEqual({ invitation_id: 'inv-1', outcome: 'revoked' });
    expect(mockRpc).toHaveBeenCalledWith(HAUL_INVITE_REVOKE_RPC_NAME, {
      p_actor_person_id: OWNER,
      p_haul_id: HAUL,
      p_invitation_id: 'inv-1',
    });
  });

  it('surfaces a non-owner as forbidden', async () => {
    install();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'HAUL_INVITE_FORBIDDEN' } });
    await expect(
      revokeHaulInvitation({ ownerPersonId: BOB, haulId: HAUL, invitationId: 'inv-1' }),
    ).rejects.toThrow(GroceryHaulForbiddenError);
  });
});

describe('listHaulInvitationsForOwner', () => {
  it('lists the Haul invitations with resolved names for the owner', async () => {
    install([
      invitation({ id: 'i-a', status: 'accepted' }),
      invitation({ id: 'i-b', status: 'pending', invited_person_id: null, invited_email_normalized: 'new@example.com', accepted_at: null }),
    ]);
    const rows = await listHaulInvitationsForOwner({ ownerPersonId: OWNER, haulId: HAUL });
    expect(rows.map((row) => [row.id, row.status, row.invited_display_name])).toEqual([
      ['i-a', 'accepted', 'Alice A'],
      ['i-b', 'pending', null],
    ]);
  });

  it('refuses a non-owner (404, not an empty list that would confirm existence)', async () => {
    install([invitation({})]);
    await expect(
      listHaulInvitationsForOwner({ ownerPersonId: BOB, haulId: HAUL }),
    ).rejects.toThrow(GroceryHaulNotFoundError);
  });
});

describe('listPendingHaulInvitationsForPerson', () => {
  it('finds pending invitations by linked person id and by email, and ignores others', async () => {
    install([
      invitation({ id: 'by-person', status: 'pending', invited_person_id: ALICE, accepted_at: null }),
      invitation({ id: 'by-email', status: 'pending', invited_person_id: null, invited_email_normalized: 'alice@example.com', accepted_at: null, haul_id: 'haul-other', owner_person_id: STRANGER }),
      invitation({ id: 'accepted', status: 'accepted', invited_person_id: ALICE }),
      invitation({ id: 'revoked', status: 'revoked', invited_person_id: ALICE, revoked_at: 'x', accepted_at: null }),
      invitation({ id: 'someone-else', status: 'pending', invited_person_id: BOB, invited_email_normalized: 'bob@example.com', accepted_at: null }),
    ]);
    const rows = await listPendingHaulInvitationsForPerson(ALICE);
    expect(rows.map((row) => row.invitation_id).sort()).toEqual(['by-email', 'by-person']);
    const byPerson = rows.find((row) => row.invitation_id === 'by-person');
    expect(byPerson).toMatchObject({ haul_title: 'Weekend', owner_display_name: 'Olive Owner' });
  });
});

describe('acceptHaulInvitation (identity binding)', () => {
  const confirmedAlice = jest.fn(async () => ({ email: 'alice@example.com', confirmed: true }));

  it('activates membership only through the RPC, with the session actor', async () => {
    install([invitation({ status: 'pending', invited_person_id: null, accepted_at: null })]);
    mockRpc.mockResolvedValue({
      data: { invitation_id: 'inv-1', haul_id: HAUL, status: 'accepted', outcome: 'accepted' },
      error: null,
    });
    const result = await acceptHaulInvitation({
      actorPersonId: ALICE,
      authUserId: 'auth-alice',
      invitationId: 'inv-1',
      lookupAuthEmail: confirmedAlice,
    });
    expect(result).toEqual({ invitation_id: 'inv-1', haul_id: HAUL, outcome: 'accepted' });
    expect(confirmedAlice).toHaveBeenCalledWith('auth-alice');
    expect(mockRpc).toHaveBeenCalledWith(HAUL_INVITE_ACCEPT_RPC_NAME, {
      p_actor_person_id: ALICE,
      p_invitation_id: 'inv-1',
    });
  });

  it('refuses an unconfirmed Auth email even if people.email matches', async () => {
    install([invitation({ status: 'pending', accepted_at: null })]);
    await expect(
      acceptHaulInvitation({
        actorPersonId: ALICE,
        authUserId: 'auth-alice',
        invitationId: 'inv-1',
        lookupAuthEmail: async () => ({ email: 'alice@example.com', confirmed: false }),
      }),
    ).rejects.toThrow(GroceryHaulForbiddenError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses a confirmed Auth email that differs from the invitation target', async () => {
    install([invitation({ status: 'pending', accepted_at: null })]);
    await expect(
      acceptHaulInvitation({
        actorPersonId: BOB,
        authUserId: 'auth-bob',
        invitationId: 'inv-1',
        lookupAuthEmail: async () => ({ email: 'bob@example.com', confirmed: true }),
      }),
    ).rejects.toThrow(GroceryHaulForbiddenError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('treats an unknown invitation as not found without calling Auth or the RPC', async () => {
    install([]);
    const lookup = jest.fn();
    await expect(
      acceptHaulInvitation({
        actorPersonId: ALICE,
        authUserId: 'auth-alice',
        invitationId: 'missing',
        lookupAuthEmail: lookup,
      }),
    ).rejects.toThrow(GroceryHaulNotFoundError);
    expect(lookup).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('still lets the database veto (people.email drift, revoked, closed Haul, unlinked)', async () => {
    install([invitation({ status: 'pending', accepted_at: null })]);
    for (const [code, errorClass] of [
      ['HAUL_INVITE_IDENTITY_MISMATCH', GroceryHaulForbiddenError],
      ['HAUL_INVITE_REVOKED', GroceryHaulConflictError],
      ['HAUL_INVITE_HAUL_NOT_OPEN', GroceryHaulConflictError],
      ['HAUL_INVITE_ACCOUNT_NOT_LINKED', GroceryHaulConflictError],
    ] as const) {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      await expect(
        acceptHaulInvitation({
          actorPersonId: ALICE,
          authUserId: 'auth-alice',
          invitationId: 'inv-1',
          lookupAuthEmail: confirmedAlice,
        }),
      ).rejects.toThrow(errorClass);
    }
  });

  it('supports idempotent re-accept', async () => {
    install([invitation({ status: 'accepted' })]);
    mockRpc.mockResolvedValue({
      data: { invitation_id: 'inv-1', haul_id: HAUL, status: 'accepted', outcome: 'already_accepted' },
      error: null,
    });
    const result = await acceptHaulInvitation({
      actorPersonId: ALICE,
      authUserId: 'auth-alice',
      invitationId: 'inv-1',
      lookupAuthEmail: confirmedAlice,
    });
    expect(result.outcome).toBe('already_accepted');
  });

  it('uses Supabase Auth admin getUserById for the default lookup', async () => {
    install([invitation({ status: 'pending', accepted_at: null })]);
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'Alice@Example.com', email_confirmed_at: '2026-09-01T00:00:00Z' } },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: { invitation_id: 'inv-1', haul_id: HAUL, status: 'accepted', outcome: 'accepted' },
      error: null,
    });
    await acceptHaulInvitation({ actorPersonId: ALICE, authUserId: 'auth-alice', invitationId: 'inv-1' });
    expect(mockGetUserById).toHaveBeenCalledWith('auth-alice');

    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'alice@example.com', email_confirmed_at: null } },
      error: null,
    });
    await expect(
      acceptHaulInvitation({ actorPersonId: ALICE, authUserId: 'auth-alice', invitationId: 'inv-1' }),
    ).rejects.toThrow(GroceryHaulForbiddenError);
  });
});

describe('contributor item mutations', () => {
  it('adds a Haul-only item through the RPC with the session actor', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'item-1', origin_type: 'haul_contributor' }, error: null });
    await addHaulContributorItem({
      actorPersonId: ALICE,
      haulId: HAUL,
      item: { name: 'Lemons', quantity: 3, unit: 'each' },
    });
    expect(mockRpc).toHaveBeenCalledWith(HAUL_CONTRIBUTOR_ITEM_ADD_RPC_NAME, {
      p_actor_person_id: ALICE,
      p_haul_id: HAUL,
      p_name: 'Lemons',
      p_quantity: 3,
      p_unit: 'each',
    });
  });

  it('rejects malformed input before the database', async () => {
    await expect(
      addHaulContributorItem({ actorPersonId: ALICE, haulId: HAUL, item: { name: 5 as unknown as string } }),
    ).rejects.toThrow(GroceryHaulValidationError);
    await expect(
      addHaulContributorItem({
        actorPersonId: ALICE,
        haulId: HAUL,
        item: { name: 'x', quantity: Number.NaN },
      }),
    ).rejects.toThrow(GroceryHaulValidationError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('only forwards name/quantity/unit on update; provenance keys cannot ride along', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'item-1' }, error: null });
    await updateHaulContributorItem({
      actorPersonId: ALICE,
      haulId: HAUL,
      itemId: 'item-1',
      patch: {
        name: 'Limes',
        // Hostile extras a client might send. None may reach the RPC.
        ...({
          added_by_person_id: BOB,
          origin_type: 'source_list_snapshot',
          person_id: STRANGER,
          haul_id: 'haul-other',
          source_grocery_list_id: 'list-9',
          grocery_item_id: 'gi-9',
        } as unknown as Record<string, never>),
      },
    });
    expect(mockRpc).toHaveBeenCalledWith(HAUL_CONTRIBUTOR_ITEM_UPDATE_RPC_NAME, {
      p_actor_person_id: ALICE,
      p_haul_id: HAUL,
      p_item_id: 'item-1',
      p_patch: { name: 'Limes' },
    });
  });

  it('rejects an empty patch and wrongly typed fields', async () => {
    await expect(
      updateHaulContributorItem({ actorPersonId: ALICE, haulId: HAUL, itemId: 'i', patch: {} }),
    ).rejects.toThrow(GroceryHaulValidationError);
    await expect(
      updateHaulContributorItem({
        actorPersonId: ALICE,
        haulId: HAUL,
        itemId: 'i',
        patch: { quantity: '3' as unknown as number },
      }),
    ).rejects.toThrow(GroceryHaulValidationError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps another member’s item / snapshot row / closed Haul to typed errors', async () => {
    for (const [code, errorClass] of [
      ['HAUL_CONTRIBUTOR_FORBIDDEN', GroceryHaulForbiddenError],
      ['HAUL_CONTRIBUTOR_ITEM_NOT_FOUND', GroceryHaulNotFoundError],
      ['HAUL_CONTRIBUTOR_NOT_DRAFT', GroceryHaulConflictError],
    ] as const) {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      await expect(
        updateHaulContributorItem({ actorPersonId: BOB, haulId: HAUL, itemId: 'item-1', patch: { name: 'x' } }),
      ).rejects.toThrow(errorClass);
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      await expect(
        removeHaulContributorItem({ actorPersonId: BOB, haulId: HAUL, itemId: 'item-1' }),
      ).rejects.toThrow(errorClass);
    }
  });

  it('removes through the RPC', async () => {
    mockRpc.mockResolvedValue({ data: { item_id: 'item-1', haul_id: HAUL, outcome: 'removed' }, error: null });
    await expect(
      removeHaulContributorItem({ actorPersonId: ALICE, haulId: HAUL, itemId: 'item-1' }),
    ).resolves.toEqual({ item_id: 'item-1', outcome: 'removed' });
    expect(mockRpc).toHaveBeenCalledWith(HAUL_CONTRIBUTOR_ITEM_REMOVE_RPC_NAME, {
      p_actor_person_id: ALICE,
      p_haul_id: HAUL,
      p_item_id: 'item-1',
    });
  });
});

describe('getSharedGroceryHaulDetail (reuses the owner read model)', () => {
  const detail = {
    haul: { id: HAUL },
    source_lists: [],
    stores: [],
    estimate: {},
    items: [
      { id: 'snap', origin_type: 'source_list_snapshot', added_by_person_id: null },
      { id: 'c1', origin_type: 'haul_contributor', added_by_person_id: ALICE },
      { id: 'c2', origin_type: 'haul_contributor', added_by_person_id: ALICE },
    ],
  };

  it('returns 404 semantics for non-members and never loads the Haul', async () => {
    install([invitation({ status: 'pending', accepted_at: null })]);
    await expect(getSharedGroceryHaulDetail({ actorPersonId: ALICE, haulId: HAUL })).rejects.toThrow(
      GroceryHaulNotFoundError,
    );
    await expect(getSharedGroceryHaulDetail({ actorPersonId: STRANGER, haulId: HAUL })).rejects.toThrow(
      GroceryHaulNotFoundError,
    );
    expect(mockGetGroceryHaulDetail).not.toHaveBeenCalled();
  });

  it('loads the Haul scoped to the OWNER for an accepted contributor and adds attribution names', async () => {
    install([invitation({ status: 'accepted' })]);
    mockGetGroceryHaulDetail.mockResolvedValue(detail);
    const shared = await getSharedGroceryHaulDetail({ actorPersonId: ALICE, haulId: HAUL });
    expect(mockGetGroceryHaulDetail).toHaveBeenCalledWith(OWNER, HAUL);
    expect(shared.viewer).toEqual({ role: 'contributor', person_id: ALICE });
    expect(shared.contributors).toEqual([{ person_id: ALICE, display_name: 'Alice A' }]);
  });

  it('serves the owner the same read model with role owner', async () => {
    install();
    mockGetGroceryHaulDetail.mockResolvedValue(detail);
    const shared = await getSharedGroceryHaulDetail({ actorPersonId: OWNER, haulId: HAUL });
    expect(mockGetGroceryHaulDetail).toHaveBeenCalledWith(OWNER, HAUL);
    expect(shared.viewer.role).toBe('owner');
  });

  it('stops serving a contributor immediately after revocation', async () => {
    install([invitation({ status: 'revoked', revoked_at: '2026-09-05T00:00:00Z' })]);
    await expect(getSharedGroceryHaulDetail({ actorPersonId: ALICE, haulId: HAUL })).rejects.toThrow(
      GroceryHaulNotFoundError,
    );
  });
});
