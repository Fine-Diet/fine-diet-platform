import type { NextApiRequest, NextApiResponse } from 'next';

const mockRequireJournalAccess = jest.fn();
const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockResolveViewerAccess = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

// ES5-target ts-jest: `extends Error` loses instanceof unless the prototype is reset.
class GroceryHaulNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulNotFoundError.prototype);
  }
}
class GroceryHaulValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulValidationError.prototype);
  }
}
class GroceryHaulConflictError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulConflictError.prototype);
  }
}
class GroceryHaulForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulForbiddenError.prototype);
  }
}

jest.mock('@/lib/plans/groceryHaul/service', () => ({
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
}));

const mockCreateInvitation = jest.fn();
const mockListInvitations = jest.fn();
const mockRevokeInvitation = jest.fn();
const mockListPending = jest.fn();
const mockAccept = jest.fn();
const mockAddItem = jest.fn();
const mockUpdateItem = jest.fn();
const mockRemoveItem = jest.fn();
const mockShared = jest.fn();

jest.mock('@/lib/plans/groceryHaul/haulCollaboration', () => ({
  createHaulInvitation: (...a: unknown[]) => mockCreateInvitation(...a),
  listHaulInvitationsForOwner: (...a: unknown[]) => mockListInvitations(...a),
  revokeHaulInvitation: (...a: unknown[]) => mockRevokeInvitation(...a),
  listPendingHaulInvitationsForPerson: (...a: unknown[]) => mockListPending(...a),
  acceptHaulInvitation: (...a: unknown[]) => mockAccept(...a),
  addHaulContributorItem: (...a: unknown[]) => mockAddItem(...a),
  updateHaulContributorItem: (...a: unknown[]) => mockUpdateItem(...a),
  removeHaulContributorItem: (...a: unknown[]) => mockRemoveItem(...a),
  getSharedGroceryHaulDetail: (...a: unknown[]) => mockShared(...a),
  resolveHaulViewerAccess: (...a: unknown[]) => mockResolveViewerAccess(...a),
}));

import invitationsHandler from '@/pages/api/journal/food/hauls/[haulId]/invitations/index';
import invitationHandler from '@/pages/api/journal/food/hauls/[haulId]/invitations/[invitationId]';
import sharedHandler from '@/pages/api/journal/food/hauls/[haulId]/shared';
import contributorItemsHandler from '@/pages/api/journal/food/hauls/[haulId]/contributor-items/index';
import contributorItemHandler from '@/pages/api/journal/food/hauls/[haulId]/contributor-items/[itemId]';
import pendingHandler from '@/pages/api/journal/food/haul-invitations/index';
import acceptHandler from '@/pages/api/journal/food/haul-invitations/[invitationId]/accept';
import { requireHaulMemberAccess } from '@/lib/access/requireHaulAccess';

type Res = NextApiResponse & { statusCode: number; body: unknown; headers: Record<string, unknown> };

function response(): Res {
  const state = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, unknown> };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get headers() {
      return state.headers;
    },
    setHeader(name: string, value: unknown) {
      state.headers[name] = value;
      return res;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return res as unknown as Res;
}

function request(
  method: string,
  query: Record<string, string> = {},
  body: unknown = undefined,
): NextApiRequest {
  return { method, query, body } as unknown as NextApiRequest;
}

const OWNER_CTX = { user: { id: 'auth-owner' }, personId: 'person-owner' };
const ALICE_CTX = { user: { id: 'auth-alice' }, personId: 'person-alice' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('owner invitation routes', () => {
  it('rejects unsupported methods with 405 before authenticating', async () => {
    const res = response();
    await invitationsHandler(request('PUT', { haulId: 'h' }), res);
    expect(res.statusCode).toBe(405);
    expect(mockRequireJournalAccess).not.toHaveBeenCalled();
  });

  it('stops at the existing owner journal-access guard when unauthenticated', async () => {
    mockRequireJournalAccess.mockResolvedValue(null);
    const res = response();
    await invitationsHandler(request('POST', { haulId: 'h' }, { email: 'a@b.co' }), res);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it('creates an invitation as the SESSION owner and ignores a forged person id', async () => {
    mockRequireJournalAccess.mockResolvedValue(OWNER_CTX);
    mockCreateInvitation.mockResolvedValue({ outcome: 'created', invitation_id: 'inv-1' });
    const res = response();
    await invitationsHandler(
      request('POST', { haulId: 'h1', person_id: 'forged-q' }, {
        email: 'new@example.com',
        person_id: 'forged',
        owner_person_id: 'forged',
        actor_person_id: 'forged',
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(mockCreateInvitation).toHaveBeenCalledWith({
      ownerPersonId: 'person-owner',
      haulId: 'h1',
      email: 'new@example.com',
    });
  });

  it('answers 200 (not 201) when nothing new was created', async () => {
    mockRequireJournalAccess.mockResolvedValue(OWNER_CTX);
    mockCreateInvitation.mockResolvedValue({ outcome: 'duplicate_pending' });
    const res = response();
    await invitationsHandler(request('POST', { haulId: 'h1' }, { email: 'a@b.co' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('lists invitations for the session owner only', async () => {
    mockRequireJournalAccess.mockResolvedValue(OWNER_CTX);
    mockListInvitations.mockResolvedValue([{ id: 'i' }]);
    const res = response();
    await invitationsHandler(request('GET', { haulId: 'h1' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockListInvitations).toHaveBeenCalledWith({ ownerPersonId: 'person-owner', haulId: 'h1' });
  });

  it.each([
    [new GroceryHaulValidationError('bad'), 400],
    [new GroceryHaulForbiddenError('no'), 403],
    [new GroceryHaulNotFoundError('nf'), 404],
    [new GroceryHaulConflictError('conflict'), 409],
  ])('maps %p to HTTP %i', async (error, status) => {
    mockRequireJournalAccess.mockResolvedValue(OWNER_CTX);
    mockCreateInvitation.mockRejectedValue(error);
    const res = response();
    await invitationsHandler(request('POST', { haulId: 'h1' }, { email: 'a@b.co' }), res);
    expect(res.statusCode).toBe(status);
  });

  it('hides unexpected errors behind a generic 500', async () => {
    mockRequireJournalAccess.mockResolvedValue(OWNER_CTX);
    mockCreateInvitation.mockRejectedValue(new Error('relation "secret" does not exist'));
    const res = response();
    await invitationsHandler(request('POST', { haulId: 'h1' }, { email: 'a@b.co' }), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('revokes as the session owner', async () => {
    mockRequireJournalAccess.mockResolvedValue(OWNER_CTX);
    mockRevokeInvitation.mockResolvedValue({ invitation_id: 'i1', outcome: 'revoked' });
    const res = response();
    await invitationHandler(request('DELETE', { haulId: 'h1', invitationId: 'i1' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockRevokeInvitation).toHaveBeenCalledWith({
      ownerPersonId: 'person-owner',
      haulId: 'h1',
      invitationId: 'i1',
    });
  });

  it('only allows DELETE on the invitation resource', async () => {
    const res = response();
    await invitationHandler(request('POST', { haulId: 'h1', invitationId: 'i1' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('invitee routes (auth-only, no journal entitlement)', () => {
  it('lists pending invitations with auth only, never the owner guard', async () => {
    mockRequireJournalAuth.mockResolvedValue(ALICE_CTX);
    mockListPending.mockResolvedValue([]);
    const res = response();
    await pendingHandler(request('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(mockListPending).toHaveBeenCalledWith('person-alice');
    expect(mockRequireJournalAccess).not.toHaveBeenCalled();
  });

  it('accepts as the session user and ignores the request body entirely', async () => {
    mockRequireJournalAuth.mockResolvedValue(ALICE_CTX);
    mockAccept.mockResolvedValue({ invitation_id: 'i1', haul_id: 'h1', outcome: 'accepted' });
    const res = response();
    await acceptHandler(
      request('POST', { invitationId: 'i1' }, { person_id: 'forged', email: 'victim@example.com' }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(mockAccept).toHaveBeenCalledWith({
      actorPersonId: 'person-alice',
      authUserId: 'auth-alice',
      invitationId: 'i1',
    });
    expect(mockRequireJournalAccess).not.toHaveBeenCalled();
  });

  it('does not accept when unauthenticated', async () => {
    mockRequireJournalAuth.mockResolvedValue(null);
    const res = response();
    await acceptHandler(request('POST', { invitationId: 'i1' }), res);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('maps an identity mismatch to 403', async () => {
    mockRequireJournalAuth.mockResolvedValue(ALICE_CTX);
    mockAccept.mockRejectedValue(new GroceryHaulForbiddenError('different email'));
    const res = response();
    await acceptHandler(request('POST', { invitationId: 'i1' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('only allows POST to accept', async () => {
    const res = response();
    await acceptHandler(request('GET', { invitationId: 'i1' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('requireHaulMemberAccess (membership-aware resolver)', () => {
  function run(haulId = 'h1') {
    const res = response();
    return requireHaulMemberAccess(request('GET'), res, haulId).then((ctx) => ({ ctx, res }));
  }

  it('passes through the auth failure untouched', async () => {
    mockRequireJournalAuth.mockResolvedValue(null);
    const { ctx } = await run();
    expect(ctx).toBeNull();
    expect(mockResolveViewerAccess).not.toHaveBeenCalled();
  });

  it('answers 404 (not 403) for a non-member so Haul existence is not disclosed', async () => {
    mockRequireJournalAuth.mockResolvedValue(ALICE_CTX);
    mockResolveViewerAccess.mockResolvedValue(null);
    const { ctx, res } = await run();
    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(404);
  });

  it('lets an accepted contributor through WITHOUT a journal entitlement check', async () => {
    mockRequireJournalAuth.mockResolvedValue(ALICE_CTX);
    mockResolveViewerAccess.mockResolvedValue({
      role: 'contributor',
      haulId: 'h1',
      ownerPersonId: 'person-owner',
      actorPersonId: 'person-alice',
    });
    const { ctx } = await run();
    expect(ctx?.access.role).toBe('contributor');
    expect(ctx?.personId).toBe('person-alice');
    expect(mockRequireCallerJournalAccess).not.toHaveBeenCalled();
  });

  it('still requires the journal entitlement for the OWNER', async () => {
    mockRequireJournalAuth.mockResolvedValue(OWNER_CTX);
    mockResolveViewerAccess.mockResolvedValue({
      role: 'owner',
      haulId: 'h1',
      ownerPersonId: 'person-owner',
      actorPersonId: 'person-owner',
    });
    mockRequireCallerJournalAccess.mockResolvedValue(false);
    const denied = await run();
    expect(denied.ctx).toBeNull();
    expect(mockRequireCallerJournalAccess).toHaveBeenCalledTimes(1);

    mockRequireCallerJournalAccess.mockResolvedValue(true);
    const allowed = await run();
    expect(allowed.ctx?.access.role).toBe('owner');
  });

  it('never elevates the contributor to the owner: the actor id stays the caller', async () => {
    mockRequireJournalAuth.mockResolvedValue(ALICE_CTX);
    mockResolveViewerAccess.mockResolvedValue({
      role: 'contributor',
      haulId: 'h1',
      ownerPersonId: 'person-owner',
      actorPersonId: 'person-alice',
    });
    const { ctx } = await run();
    expect(ctx?.personId).not.toBe(ctx?.access.ownerPersonId);
  });
});

function memberAs(role: 'owner' | 'contributor') {
  const ctx = role === 'owner' ? OWNER_CTX : ALICE_CTX;
  mockRequireJournalAuth.mockResolvedValue(ctx);
  mockResolveViewerAccess.mockResolvedValue({
    role,
    haulId: 'h1',
    ownerPersonId: 'person-owner',
    actorPersonId: ctx.personId,
  });
  mockRequireCallerJournalAccess.mockResolvedValue(true);
}

describe('shared read and contributor item routes', () => {
  it('serves the shared read for a member and 404s a non-member', async () => {
    memberAs('contributor');
    mockShared.mockResolvedValue({ detail: {}, viewer: { role: 'contributor' }, contributors: [] });
    const ok = response();
    await sharedHandler(request('GET', { haulId: 'h1' }), ok);
    expect(ok.statusCode).toBe(200);
    expect(mockShared).toHaveBeenCalledWith({ actorPersonId: 'person-alice', haulId: 'h1' });

    mockShared.mockClear();
    mockResolveViewerAccess.mockResolvedValue(null);
    const denied = response();
    await sharedHandler(request('GET', { haulId: 'h1' }), denied);
    expect(denied.statusCode).toBe(404);
    expect(mockShared).not.toHaveBeenCalled();
  });

  it('adds an item as the session contributor; attribution/origin fields in the body are ignored', async () => {
    memberAs('contributor');
    mockAddItem.mockResolvedValue({ id: 'item-1' });
    const res = response();
    await contributorItemsHandler(
      request('POST', { haulId: 'h1' }, {
        name: 'Lemons',
        quantity: 3,
        unit: 'each',
        added_by_person_id: 'forged',
        person_id: 'forged',
        origin_type: 'source_list_snapshot',
        source_grocery_list_id: 'list-1',
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(mockAddItem).toHaveBeenCalledWith({
      actorPersonId: 'person-alice',
      haulId: 'h1',
      item: { name: 'Lemons', quantity: 3, unit: 'each' },
    });
  });

  it('requires an item name and never calls the service for a non-member', async () => {
    memberAs('contributor');
    const missing = response();
    await contributorItemsHandler(request('POST', { haulId: 'h1' }, { quantity: 1 }), missing);
    expect(missing.statusCode).toBe(400);

    mockResolveViewerAccess.mockResolvedValue(null);
    const denied = response();
    await contributorItemsHandler(request('POST', { haulId: 'h1' }, { name: 'x' }), denied);
    expect(denied.statusCode).toBe(404);
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('patches only name/quantity/unit, with the session actor', async () => {
    memberAs('contributor');
    mockUpdateItem.mockResolvedValue({ id: 'item-1' });
    const res = response();
    await contributorItemHandler(
      request('PATCH', { haulId: 'h1', itemId: 'item-1' }, {
        name: 'Limes',
        added_by_person_id: 'forged',
        origin_type: 'source_list_snapshot',
        person_id: 'forged',
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(mockUpdateItem).toHaveBeenCalledWith({
      actorPersonId: 'person-alice',
      haulId: 'h1',
      itemId: 'item-1',
      patch: { name: 'Limes' },
    });
  });

  it('lets the owner remove any contributor item through the same route', async () => {
    memberAs('owner');
    mockRemoveItem.mockResolvedValue({ item_id: 'item-1', outcome: 'removed' });
    const res = response();
    await contributorItemHandler(request('DELETE', { haulId: 'h1', itemId: 'item-1' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockRemoveItem).toHaveBeenCalledWith({
      actorPersonId: 'person-owner',
      haulId: 'h1',
      itemId: 'item-1',
    });
  });

  it("maps another member's item to 403 and a closed Haul to 409", async () => {
    memberAs('contributor');
    mockRemoveItem.mockRejectedValueOnce(new GroceryHaulForbiddenError('no'));
    const forbidden = response();
    await contributorItemHandler(request('DELETE', { haulId: 'h1', itemId: 'x' }), forbidden);
    expect(forbidden.statusCode).toBe(403);

    mockRemoveItem.mockRejectedValueOnce(new GroceryHaulConflictError('not draft'));
    const conflict = response();
    await contributorItemHandler(request('DELETE', { haulId: 'h1', itemId: 'x' }), conflict);
    expect(conflict.statusCode).toBe(409);
  });

  it('restricts methods on both item routes', async () => {
    const a = response();
    await contributorItemsHandler(request('GET', { haulId: 'h1' }), a);
    expect(a.statusCode).toBe(405);
    const b = response();
    await contributorItemHandler(request('POST', { haulId: 'h1', itemId: 'i' }), b);
    expect(b.statusCode).toBe(405);
  });
});

describe('route → guard wiring (source contract)', () => {
  // Cheap, deliberate guard against a future edit silently swapping a guard.
  const fs = require('fs') as typeof import('fs');
  const read = (path: string) => fs.readFileSync(path, 'utf8');

  it('owner-only routes use requireJournalAccess and never the membership resolver', () => {
    for (const path of [
      'pages/api/journal/food/hauls/[haulId]/invitations/index.ts',
      'pages/api/journal/food/hauls/[haulId]/invitations/[invitationId].ts',
    ]) {
      const source = read(path);
      expect(source).toContain('requireJournalAccess');
      expect(source).not.toContain('requireHaulMemberAccess');
    }
  });

  it('contributor routes use the membership resolver and never fake owner access', () => {
    for (const path of [
      'pages/api/journal/food/hauls/[haulId]/shared.ts',
      'pages/api/journal/food/hauls/[haulId]/contributor-items/index.ts',
      'pages/api/journal/food/hauls/[haulId]/contributor-items/[itemId].ts',
    ]) {
      const source = read(path);
      expect(source).toContain('requireHaulMemberAccess');
      expect(source).not.toContain('requireJournalAccess');
    }
  });

  it('invitee routes are auth-only', () => {
    for (const path of [
      'pages/api/journal/food/haul-invitations/index.ts',
      'pages/api/journal/food/haul-invitations/[invitationId]/accept.ts',
    ]) {
      const source = read(path);
      expect(source).toContain('requireJournalAuth');
      expect(source).not.toContain('requireJournalAccess(');
    }
  });

  it('no route reads a person id from the request', () => {
    const glob = [
      'pages/api/journal/food/hauls/[haulId]/invitations/index.ts',
      'pages/api/journal/food/hauls/[haulId]/invitations/[invitationId].ts',
      'pages/api/journal/food/hauls/[haulId]/shared.ts',
      'pages/api/journal/food/hauls/[haulId]/contributor-items/index.ts',
      'pages/api/journal/food/hauls/[haulId]/contributor-items/[itemId].ts',
      'pages/api/journal/food/haul-invitations/index.ts',
      'pages/api/journal/food/haul-invitations/[invitationId]/accept.ts',
    ];
    for (const path of glob) {
      expect(read(path)).not.toMatch(/body\.(person_id|owner_person_id|actor_person_id|added_by_person_id)|query\.person_id/);
    }
  });
});
