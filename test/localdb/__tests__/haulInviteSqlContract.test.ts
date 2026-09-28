/**
 * Invite to Haul v1 — Phase B1 real-PostgreSQL contract.
 *
 * Runs the repository's real Haul SQL files plus addHaulInviteCollaboration.sql
 * against a guarded disposable local cluster. These are the checks a static SQL
 * string assertion cannot make: constraint coherence, trigger behavior, RLS and
 * grants as the actual Supabase roles, and a real two-session race.
 *
 * Every RPC is called as `service_role`, the only role granted EXECUTE, so a
 * missing grant fails here rather than in production.
 */

import type { Client } from 'pg';

import { startHaulFixture, type HaulFixture, type HaulPerson } from '../haulHarness';

jest.setTimeout(180_000);

let fixture: HaulFixture;
let svc: Client;

const INVITE_FUNCTIONS = [
  'create_grocery_haul_invitation(uuid, uuid, text)',
  'revoke_grocery_haul_invitation(uuid, uuid, uuid)',
  'accept_grocery_haul_invitation(uuid, uuid)',
  'add_grocery_haul_contributor_item(uuid, uuid, text, numeric, text)',
  'update_grocery_haul_contributor_item(uuid, uuid, uuid, jsonb)',
  'remove_grocery_haul_contributor_item(uuid, uuid, uuid)',
];

// Legacy data created BEFORE the invite migration is applied, to prove existing
// Haul snapshots survive the additive schema evolution untouched.
let legacy: { haulId: string; itemIds: string[]; ownerId: string; listId: string };

beforeAll(async () => {
  fixture = await startHaulFixture({ applyInvite: false });

  const owner = await fixture.linkedPerson();
  const { listId, itemIds } = await fixture.listWithItems(owner.personId, ['Legacy A', 'Legacy B']);
  const haulId = await fixture.haulFromList(owner.personId, listId, itemIds);
  legacy = { haulId, itemIds, ownerId: owner.personId, listId };

  await fixture.applyInvite();

  svc = await fixture.connect();
  await svc.query('SET ROLE service_role');
});

afterAll(async () => {
  if (svc) await svc.end();
  if (fixture) await fixture.destroy();
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function call<T = Record<string, any>>(fn: string, ...args: unknown[]): Promise<T> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(', ');
  const result = await svc.query(`SELECT public.${fn}(${placeholders}) AS r`, args);
  return result.rows[0].r as T;
}

async function updateItem(
  actor: string,
  haulId: string,
  itemId: string,
  patch: Record<string, unknown>,
) {
  const result = await svc.query(
    `SELECT public.update_grocery_haul_contributor_item($1, $2, $3, $4::jsonb) AS r`,
    [actor, haulId, itemId, JSON.stringify(patch)],
  );
  return result.rows[0].r as Record<string, any>;
}

async function scenario(items: string[] = ['Oats', 'Rice']) {
  const owner = await fixture.linkedPerson();
  const { listId, itemIds } = await fixture.listWithItems(owner.personId, items);
  const haulId = await fixture.haulFromList(owner.personId, listId, itemIds);
  // itemIds are the SOURCE grocery_items ids. snapshotItemId is the Haul's own
  // frozen copy of the first one, i.e. a grocery_haul_items.id.
  const [snapshot] = await fixture.sql<{ id: string }>(
    `SELECT id FROM public.grocery_haul_items WHERE haul_id = $1 ORDER BY created_at, id LIMIT 1`,
    [haulId],
  );
  return { owner, listId, itemIds, haulId, snapshotItemId: snapshot.id };
}

async function invite(s: { owner: HaulPerson; haulId: string }, email: string) {
  return call('create_grocery_haul_invitation', s.owner.personId, s.haulId, email);
}

async function acceptedMember(s: { owner: HaulPerson; haulId: string }) {
  const person = await fixture.linkedPerson();
  const created = await invite(s, person.email);
  await call('accept_grocery_haul_invitation', person.personId, created.invitation_id);
  return { person, invitationId: created.invitation_id as string };
}

async function contributorItems(haulId: string) {
  return fixture.sql<Record<string, any>>(
    `SELECT * FROM public.grocery_haul_items
      WHERE haul_id = $1 AND origin_type = 'haul_contributor' ORDER BY created_at, id`,
    [haulId],
  );
}

// ---------------------------------------------------------------------------
// 1. Existing Haul snapshots survive the additive evolution
// ---------------------------------------------------------------------------

describe('existing Haul snapshot regression', () => {
  it('backfills legacy items as immutable source_list_snapshot rows', async () => {
    const rows = await fixture.sql<Record<string, any>>(
      `SELECT origin_type, added_by_person_id, source_grocery_list_id, person_id, name_snapshot
         FROM public.grocery_haul_items WHERE haul_id = $1 ORDER BY name_snapshot`,
      [legacy.haulId],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.origin_type).toBe('source_list_snapshot');
      expect(row.added_by_person_id).toBeNull();
      expect(row.source_grocery_list_id).toBe(legacy.listId);
      expect(row.person_id).toBe(legacy.ownerId);
    }
  });

  it('applies idempotently a second time without changing legacy rows', async () => {
    const before = await fixture.sql(
      `SELECT id, origin_type, name_snapshot FROM public.grocery_haul_items ORDER BY id`,
    );
    await fixture.applyInvite();
    const after = await fixture.sql(
      `SELECT id, origin_type, name_snapshot FROM public.grocery_haul_items ORDER BY id`,
    );
    expect(after).toEqual(before);
  });

  it('keeps the source-membership FK enforced for source_list_snapshot rows', async () => {
    const s = await scenario(['Beans']);
    const other = await fixture.linkedPerson();
    const foreign = await fixture.listWithItems(other.personId, ['Foreign']);
    await expect(
      svc.query(
        `INSERT INTO public.grocery_haul_items (
           haul_id, person_id, source_grocery_list_id, name_snapshot, source_status_snapshot
         ) VALUES ($1, $2, $3, 'Sneaky', 'pending')`,
        [s.haulId, s.owner.personId, foreign.listId],
      ),
    ).rejects.toThrow(/grocery_haul_items_source_membership_fk|violates foreign key/i);
  });

  it('rejects a snapshot row with no source List and any snapshot row with attribution', async () => {
    const s = await scenario(['Beans']);
    await expect(
      svc.query(
        `INSERT INTO public.grocery_haul_items (haul_id, person_id, name_snapshot, source_status_snapshot)
         VALUES ($1, $2, 'No source', 'pending')`,
        [s.haulId, s.owner.personId],
      ),
    ).rejects.toThrow(/grocery_haul_items_origin_coherent/);
    const member = await fixture.linkedPerson();
    await expect(
      fixture.sql(`UPDATE public.grocery_haul_items SET added_by_person_id = $2 WHERE id = $1`, [
        s.snapshotItemId,
        member.personId,
      ]),
    ).rejects.toThrow(/grocery_haul_items_origin_coherent|HAUL_ITEM_SNAPSHOT_IMMUTABLE/);
  });

  it('keeps snapshot provenance immutable for source-list rows', async () => {
    const s = await scenario(['Beans']);
    for (const column of ['name_snapshot', 'unit_snapshot']) {
      await expect(
        svc.query(`UPDATE public.grocery_haul_items SET ${column} = 'changed' WHERE id = $1`, [
          s.snapshotItemId,
        ]),
      ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE/);
    }
    await expect(
      svc.query(`UPDATE public.grocery_haul_items SET quantity_snapshot = 99 WHERE id = $1`, [
        s.snapshotItemId,
      ]),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE/);
    await expect(
      svc.query(
        `UPDATE public.grocery_haul_items SET origin_type = 'haul_contributor' WHERE id = $1`,
        [s.snapshotItemId],
      ),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE/);
  });

  it('still lets the owner do normal preparation edits on snapshot rows', async () => {
    const s = await scenario(['Beans']);
    const rows = await svc.query(
      `UPDATE public.grocery_haul_items
          SET final_quantity = 5, product_title = 'Black beans'
        WHERE id = $1 RETURNING final_quantity`,
      [s.snapshotItemId],
    );
    expect(Number(rows.rows[0].final_quantity)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. Grants, RLS and function hygiene (as the real roles)
// ---------------------------------------------------------------------------

describe('grants, RLS and function hygiene', () => {
  it('has no SECURITY DEFINER function anywhere in the Haul surface', async () => {
    const rows = await fixture.sql<{ proname: string }>(
      `SELECT proname FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace AND prosecdef`,
    );
    expect(rows).toEqual([]);
  });

  it('pins search_path on every new function', async () => {
    const rows = await fixture.sql<{ proname: string; proconfig: string[] | null }>(
      `SELECT proname, proconfig FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN (
            'create_grocery_haul_invitation', 'revoke_grocery_haul_invitation',
            'accept_grocery_haul_invitation', 'add_grocery_haul_contributor_item',
            'update_grocery_haul_contributor_item', 'remove_grocery_haul_contributor_item',
            'guard_grocery_haul_invitation', 'guard_grocery_haul_item_origin',
            'guard_grocery_haul_execution_item_source', 'guard_grocery_haul_item_preparation'
          )`,
    );
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.proconfig).toContain('search_path=public, pg_temp');
    }
  });

  it('grants RPC EXECUTE to service_role only', async () => {
    for (const signature of INVITE_FUNCTIONS) {
      const rows = await fixture.sql<Record<string, boolean>>(
        `SELECT
           has_function_privilege('service_role', 'public.${signature}', 'EXECUTE') AS service_role,
           has_function_privilege('authenticated', 'public.${signature}', 'EXECUTE') AS authenticated,
           has_function_privilege('anon', 'public.${signature}', 'EXECUTE') AS anon`,
      );
      expect(rows[0]).toEqual({ service_role: true, authenticated: false, anon: false });
    }
  });

  it('denies authenticated and anon any direct invitation write and denies anon reads', async () => {
    const s = await scenario(['Beans']);
    const member = await fixture.linkedPerson();
    const invitation = await invite(s, member.email);

    await fixture.asRole('authenticated', member.authUserId, async (client) => {
      await expect(
        client.query(
          `INSERT INTO public.grocery_haul_invitations
             (haul_id, owner_person_id, invited_email_normalized) VALUES ($1, $2, 'x@y.z')`,
          [s.haulId, s.owner.personId],
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        client.query(
          `UPDATE public.grocery_haul_invitations SET status = 'accepted' WHERE id = $1`,
          [invitation.invitation_id],
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        client.query(`DELETE FROM public.grocery_haul_invitations WHERE id = $1`, [
          invitation.invitation_id,
        ]),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        client.query(`SELECT public.accept_grocery_haul_invitation($1, $2)`, [
          member.personId,
          invitation.invitation_id,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
    await fixture.asRole('anon', null, async (client) => {
      await expect(
        client.query(`SELECT id FROM public.grocery_haul_invitations`),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('denies authenticated direct writes to Haul items and Haul rows', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    await fixture.asRole('authenticated', member.person.authUserId, async (client) => {
      await expect(
        client.query(`UPDATE public.grocery_haul_items SET final_quantity = 9 WHERE haul_id = $1`, [
          s.haulId,
        ]),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        client.query(
          `INSERT INTO public.grocery_haul_items
             (haul_id, person_id, name_snapshot, source_status_snapshot, origin_type, added_by_person_id)
           VALUES ($1, $2, 'Direct', 'pending', 'haul_contributor', $3)`,
          [s.haulId, s.owner.personId, member.person.personId],
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        client.query(`UPDATE public.grocery_hauls SET title = 'Hijack' WHERE id = $1`, [s.haulId]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('scopes invitation reads by row predicate', async () => {
    const s = await scenario(['Beans']);
    const invitee = await fixture.linkedPerson();
    const stranger = await fixture.linkedPerson();
    const created = await invite(s, invitee.email);

    const ids = async (person: HaulPerson) =>
      fixture.asRole('authenticated', person.authUserId, async (client) => {
        const rows = await client.query(
          `SELECT id FROM public.grocery_haul_invitations WHERE haul_id = $1`,
          [s.haulId],
        );
        return rows.rows.map((row) => row.id);
      });

    expect(await ids(s.owner)).toEqual([created.invitation_id]);
    expect(await ids(invitee)).toEqual([created.invitation_id]); // pending, by email
    expect(await ids(stranger)).toEqual([]);

    await call('accept_grocery_haul_invitation', invitee.personId, created.invitation_id);
    expect(await ids(invitee)).toEqual([created.invitation_id]); // accepted, by person

    await call('revoke_grocery_haul_invitation', s.owner.personId, s.haulId, created.invitation_id);
    expect(await ids(invitee)).toEqual([]); // revoked history hidden from the invitee
    expect(await ids(s.owner)).toEqual([created.invitation_id]);
  });

  it('gives accepted contributors read-only access to the shared Haul and items, and nothing else', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const pending = await fixture.linkedPerson();
    await invite(s, pending.email);
    const stranger = await fixture.linkedPerson();

    const visible = async (person: HaulPerson) =>
      fixture.asRole('authenticated', person.authUserId, async (client) => {
        const count = async (table: string) =>
          Number(
            (
              await client.query(`SELECT count(*)::int AS n FROM public.${table} WHERE haul_id = $1`, [
                s.haulId,
              ])
            ).rows[0].n,
          );
        const hauls = await client.query(`SELECT id FROM public.grocery_hauls WHERE id = $1`, [
          s.haulId,
        ]);
        return {
          hauls: hauls.rows.length,
          items: await count('grocery_haul_items'),
          sourceLists: await count('grocery_haul_source_lists'),
          stores: await count('grocery_haul_stores'),
          execution: await count('grocery_haul_execution_items'),
        };
      });

    expect(await visible(s.owner)).toEqual({
      hauls: 1, items: 1, sourceLists: 1, stores: 0, execution: 0,
    });
    expect(await visible(member.person)).toEqual({
      hauls: 1, items: 1, sourceLists: 0, stores: 0, execution: 0,
    });
    expect(await visible(pending)).toEqual({
      hauls: 0, items: 0, sourceLists: 0, stores: 0, execution: 0,
    });
    expect(await visible(stranger)).toEqual({
      hauls: 0, items: 0, sourceLists: 0, stores: 0, execution: 0,
    });
  });

  it('removes contributor read access immediately on revocation', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const readable = () =>
      fixture.asRole('authenticated', member.person.authUserId, async (client) =>
        (await client.query(`SELECT id FROM public.grocery_hauls WHERE id = $1`, [s.haulId])).rows
          .length,
      );
    expect(await readable()).toBe(1);
    await call('revoke_grocery_haul_invitation', s.owner.personId, s.haulId, member.invitationId);
    expect(await readable()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Invitation lifecycle + identity binding
// ---------------------------------------------------------------------------

describe('invitation lifecycle', () => {
  it('creates an invitation for an existing linked account and resolves the person', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.linkedPerson();
    const created = await invite(s, person.email);
    expect(created.outcome).toBe('created');
    expect(created.status).toBe('pending');
    expect(created.invited_person_id).toBe(person.personId);
    expect(created.invited_account_linked).toBe(true);
  });

  it('creates an invitation for an existing person row that is not linked yet', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.unlinkedPerson();
    const created = await invite(s, person.email);
    expect(created.invited_person_id).toBe(person.personId);
    expect(created.invited_account_linked).toBe(false);
  });

  it('creates an invitation for an email with no Fine Diet person yet', async () => {
    const s = await scenario(['Beans']);
    const created = await invite(s, 'brand-new@local.invalid');
    expect(created.outcome).toBe('created');
    expect(created.invited_person_id).toBeNull();
    expect(created.invited_account_linked).toBe(false);
  });

  it('normalizes email and collapses duplicate pending invitations', async () => {
    const s = await scenario(['Beans']);
    const first = await invite(s, 'Dup@Local.Invalid');
    const second = await invite(s, '  dup@LOCAL.invalid ');
    expect(first.outcome).toBe('created');
    expect(first.invited_email_normalized).toBe('dup@local.invalid');
    expect(second.outcome).toBe('duplicate_pending');
    expect(second.invitation_id).toBe(first.invitation_id);
    const count = await fixture.sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.grocery_haul_invitations WHERE haul_id = $1`,
      [s.haulId],
    );
    expect(count[0].n).toBe(1);
  });

  it('matches a mixed-case stored people.email by normalized comparison', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.linkedPerson('Mixed.Case@Local.Invalid');
    const created = await invite(s, ' mixed.case@local.invalid ');
    expect(created.invited_person_id).toBe(person.personId);
    const accepted = await call('accept_grocery_haul_invitation', person.personId, created.invitation_id);
    expect(accepted.outcome).toBe('accepted');
  });

  it('reports already_member for an accepted email', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const again = await invite(s, member.person.email);
    expect(again.outcome).toBe('already_member');
    expect(again.invitation_id).toBe(member.invitationId);
  });

  it('rejects self-invites, invalid emails, non-owners and non-Draft Hauls', async () => {
    const s = await scenario(['Beans']);
    await expect(invite(s, s.owner.email)).rejects.toThrow(/HAUL_INVITE_SELF/);
    await expect(invite(s, `  ${s.owner.email.toUpperCase()}  `)).rejects.toThrow(/HAUL_INVITE_SELF/);
    await expect(invite(s, 'not-an-email')).rejects.toThrow(/HAUL_INVITE_INVALID_EMAIL/);
    await expect(invite(s, 'two@@local.invalid')).rejects.toThrow(/HAUL_INVITE_INVALID_EMAIL/);

    const intruder = await fixture.linkedPerson();
    await expect(
      call('create_grocery_haul_invitation', intruder.personId, s.haulId, 'x@local.invalid'),
    ).rejects.toThrow(/HAUL_INVITE_NOT_FOUND/);

    await fixture.sql(`UPDATE public.grocery_hauls SET status = 'active' WHERE id = $1`, [s.haulId]);
    await expect(invite(s, 'late@local.invalid')).rejects.toThrow(/HAUL_INVITE_NOT_DRAFT/);
  });

  it('caps live invitations per Haul', async () => {
    const s = await scenario(['Beans']);
    for (let index = 0; index < 10; index += 1) {
      await invite(s, `cap-${index}@local.invalid`);
    }
    await expect(invite(s, 'cap-overflow@local.invalid')).rejects.toThrow(/HAUL_INVITE_LIMIT/);
  });

  it('caps pending invitations per owner across Hauls', async () => {
    const owner = await fixture.linkedPerson();
    const first = await fixture.listWithItems(owner.personId, ['a']);
    const haulIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const list = await fixture.listWithItems(owner.personId, ['a']);
      haulIds.push(await fixture.haulFromList(owner.personId, list.listId, list.itemIds));
    }
    void first;
    let sent = 0;
    for (let index = 0; index < 20; index += 1) {
      await call(
        'create_grocery_haul_invitation',
        owner.personId,
        haulIds[Math.floor(index / 10)],
        `owner-cap-${index}@local.invalid`,
      );
      sent += 1;
    }
    expect(sent).toBe(20);
    await expect(
      call('create_grocery_haul_invitation', owner.personId, haulIds[2], 'owner-cap-x@local.invalid'),
    ).rejects.toThrow(/HAUL_INVITE_LIMIT/);
  });

  it('accepts only for the linked person whose normalized email matches', async () => {
    const s = await scenario(['Beans']);
    const invitee = await fixture.linkedPerson();
    const other = await fixture.linkedPerson();
    const created = await invite(s, invitee.email);

    await expect(
      call('accept_grocery_haul_invitation', other.personId, created.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_IDENTITY_MISMATCH/);
    await expect(
      call('accept_grocery_haul_invitation', s.owner.personId, created.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_IDENTITY_MISMATCH/);

    const accepted = await call('accept_grocery_haul_invitation', invitee.personId, created.invitation_id);
    expect(accepted.outcome).toBe('accepted');
    const row = (
      await fixture.sql<Record<string, any>>(
        `SELECT status, invited_person_id, accepted_at FROM public.grocery_haul_invitations WHERE id = $1`,
        [created.invitation_id],
      )
    )[0];
    expect(row.status).toBe('accepted');
    expect(row.invited_person_id).toBe(invitee.personId);
    expect(row.accepted_at).not.toBeNull();

    // A second accept is idempotent for the same person, forbidden for anyone else.
    const again = await call('accept_grocery_haul_invitation', invitee.personId, created.invitation_id);
    expect(again.outcome).toBe('already_accepted');
    await expect(
      call('accept_grocery_haul_invitation', other.personId, created.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_IDENTITY_MISMATCH/);
  });

  it('never activates membership on email alone: an unlinked person cannot accept', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.unlinkedPerson();
    const created = await invite(s, person.email);
    await expect(
      call('accept_grocery_haul_invitation', person.personId, created.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_ACCOUNT_NOT_LINKED/);

    // After account linking (existing link-person semantics) the same invitation binds.
    await fixture.linkPerson(person.personId);
    const accepted = await call('accept_grocery_haul_invitation', person.personId, created.invitation_id);
    expect(accepted.outcome).toBe('accepted');
  });

  it('binds an invitation created before the invitee had any person row', async () => {
    const s = await scenario(['Beans']);
    const created = await invite(s, 'late-signup@local.invalid');
    expect(created.invited_person_id).toBeNull();
    const person = await fixture.linkedPerson('late-signup@local.invalid');
    const accepted = await call('accept_grocery_haul_invitation', person.personId, created.invitation_id);
    expect(accepted.outcome).toBe('accepted');
  });

  it('refuses acceptance after the person email no longer matches the invitation', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.linkedPerson();
    const created = await invite(s, person.email);
    await fixture.sql(`UPDATE public.people SET email = $2 WHERE id = $1`, [
      person.personId,
      'changed@local.invalid',
    ]);
    await expect(
      call('accept_grocery_haul_invitation', person.personId, created.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_IDENTITY_MISMATCH/);
  });

  it('cannot be forged by writing membership directly, even as service_role', async () => {
    const s = await scenario(['Beans']);
    const attacker = await fixture.linkedPerson();
    const victimInvite = await invite(s, 'victim@local.invalid');

    await expect(
      svc.query(
        `INSERT INTO public.grocery_haul_invitations
           (haul_id, owner_person_id, invited_email_normalized, invited_person_id, status, accepted_at)
         VALUES ($1, $2, $3, $4, 'accepted', now())`,
        [s.haulId, s.owner.personId, attacker.email, attacker.personId],
      ),
    ).rejects.toThrow(/HAUL_INVITE_INVALID_STATE/);

    await expect(
      svc.query(
        `UPDATE public.grocery_haul_invitations
            SET status = 'accepted', invited_person_id = $2, accepted_at = now()
          WHERE id = $1`,
        [victimInvite.invitation_id, attacker.personId],
      ),
    ).rejects.toThrow(/HAUL_INVITE_IDENTITY_MISMATCH/);

    await expect(
      svc.query(
        `UPDATE public.grocery_haul_invitations SET invited_email_normalized = $2 WHERE id = $1`,
        [victimInvite.invitation_id, attacker.email],
      ),
    ).rejects.toThrow(/HAUL_INVITE_IMMUTABLE/);
  });

  it('rejects acceptance on closed Hauls and after revocation', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.linkedPerson();
    const created = await invite(s, person.email);
    await call('revoke_grocery_haul_invitation', s.owner.personId, s.haulId, created.invitation_id);
    await expect(
      call('accept_grocery_haul_invitation', person.personId, created.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_REVOKED/);

    const t = await scenario(['Beans']);
    const person2 = await fixture.linkedPerson();
    const created2 = await invite(t, person2.email);
    await fixture.sql(`UPDATE public.grocery_hauls SET status = 'closed' WHERE id = $1`, [t.haulId]);
    await expect(
      call('accept_grocery_haul_invitation', person2.personId, created2.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_HAUL_NOT_OPEN/);
  });

  it('revokes pending invitations and removes accepted members, owner only', async () => {
    const s = await scenario(['Beans']);
    const pending = await invite(s, 'pending-revoke@local.invalid');
    const member = await acceptedMember(s);
    const stranger = await fixture.linkedPerson();

    await expect(
      call('revoke_grocery_haul_invitation', stranger.personId, s.haulId, pending.invitation_id),
    ).rejects.toThrow(/HAUL_INVITE_NOT_FOUND/);
    await expect(
      call('revoke_grocery_haul_invitation', member.person.personId, s.haulId, member.invitationId),
    ).rejects.toThrow(/HAUL_INVITE_NOT_FOUND/);

    const revokedPending = await call(
      'revoke_grocery_haul_invitation', s.owner.personId, s.haulId, pending.invitation_id,
    );
    expect(revokedPending).toMatchObject({ outcome: 'revoked', previous_status: 'pending' });
    const removed = await call(
      'revoke_grocery_haul_invitation', s.owner.personId, s.haulId, member.invitationId,
    );
    expect(removed).toMatchObject({ outcome: 'revoked', previous_status: 'accepted' });
    const noop = await call(
      'revoke_grocery_haul_invitation', s.owner.personId, s.haulId, member.invitationId,
    );
    expect(noop.outcome).toBe('noop');
  });

  it('makes revoked terminal but allows a controlled reinvite as a new row', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.linkedPerson();
    const first = await invite(s, person.email);
    await call('revoke_grocery_haul_invitation', s.owner.personId, s.haulId, first.invitation_id);

    await expect(
      svc.query(`UPDATE public.grocery_haul_invitations SET status = 'pending', revoked_at = NULL WHERE id = $1`, [
        first.invitation_id,
      ]),
    ).rejects.toThrow(/HAUL_INVITE_INVALID_TRANSITION/);

    const second = await invite(s, person.email);
    expect(second.outcome).toBe('created');
    expect(second.invitation_id).not.toBe(first.invitation_id);
    const third = await invite(s, person.email);
    expect(third.outcome).toBe('duplicate_pending');

    const rows = await fixture.sql<{ status: string }>(
      `SELECT status FROM public.grocery_haul_invitations
        WHERE haul_id = $1 ORDER BY created_at, id`,
      [s.haulId],
    );
    expect(rows.map((row) => row.status)).toEqual(['revoked', 'pending']);
  });

  it('enforces one live membership per person even across two emails', async () => {
    const s = await scenario(['Beans']);
    const person = await fixture.linkedPerson();
    await invite(s, person.email);
    await expect(
      fixture.sql(
        `INSERT INTO public.grocery_haul_invitations
           (haul_id, owner_person_id, invited_email_normalized, invited_person_id)
         VALUES ($1, $2, 'alias@local.invalid', $3)`,
        [s.haulId, s.owner.personId, person.personId],
      ),
    ).rejects.toThrow(/idx_grocery_haul_invitations_live_person/);
  });

  it('keeps the invited role pinned to contributor and rejects malformed state', async () => {
    const s = await scenario(['Beans']);
    await expect(
      fixture.sql(
        `INSERT INTO public.grocery_haul_invitations
           (haul_id, owner_person_id, invited_email_normalized, role)
         VALUES ($1, $2, 'r@local.invalid', 'owner')`,
        [s.haulId, s.owner.personId],
      ),
    ).rejects.toThrow(/grocery_haul_invitations_role_check/);
    await expect(
      fixture.sql(
        `INSERT INTO public.grocery_haul_invitations
           (haul_id, owner_person_id, invited_email_normalized)
         VALUES ($1, $2, 'Upper@Local.Invalid')`,
        [s.haulId, s.owner.personId],
      ),
    ).rejects.toThrow(/grocery_haul_invitations_email_normalized/);
  });

  it('dies with the Haul', async () => {
    const s = await scenario(['Beans']);
    await invite(s, 'cascade@local.invalid');
    await fixture.sql(`DELETE FROM public.grocery_hauls WHERE id = $1`, [s.haulId]);
    const rows = await fixture.sql(
      `SELECT id FROM public.grocery_haul_invitations WHERE haul_id = $1`,
      [s.haulId],
    );
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Contributor Haul-only items: provenance + authorization
// ---------------------------------------------------------------------------

describe('contributor Haul-only provenance', () => {
  it('adds a true Haul-only item owned by the owner and attributed to the contributor', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const sourceBefore = await fixture.sql(
      `SELECT count(*)::int AS n FROM public.grocery_items WHERE grocery_list_id = $1`,
      [s.listId],
    );

    const item = await call<Record<string, any>>(
      'add_grocery_haul_contributor_item', member.person.personId, s.haulId, '  Almond milk ', 3, ' carton ',
    );
    expect(item).toMatchObject({
      haul_id: s.haulId,
      person_id: s.owner.personId,
      origin_type: 'haul_contributor',
      added_by_person_id: member.person.personId,
      source_grocery_list_id: null,
      grocery_item_id: null,
      food_object_id_snapshot: null,
      source_type_snapshot: null,
      source_id_snapshot: null,
      source_status_snapshot: 'pending',
      name_snapshot: 'Almond milk',
      unit_snapshot: 'carton',
      resolution_source: null,
      price_amount: null,
    });
    expect(Number(item.quantity_snapshot)).toBe(3);
    expect(Number(item.final_quantity)).toBe(3);

    // Never writes back to grocery_items / source Lists.
    const sourceAfter = await fixture.sql(
      `SELECT count(*)::int AS n FROM public.grocery_items WHERE grocery_list_id = $1`,
      [s.listId],
    );
    expect(sourceAfter).toEqual(sourceBefore);
    const leaked = await fixture.sql(
      `SELECT id FROM public.grocery_items WHERE name = 'Almond milk'`,
    );
    expect(leaked).toEqual([]);
  });

  it('defaults quantity to 1 and treats a blank unit as null', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>(
      'add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Salt', null, '   ',
    );
    expect(Number(item.quantity_snapshot)).toBe(1);
    expect(item.unit_snapshot).toBeNull();
  });

  it('rejects non-members: pending invitee, revoked member, stranger, and the owner', async () => {
    const s = await scenario(['Beans']);
    const pending = await fixture.linkedPerson();
    await invite(s, pending.email);
    const revoked = await acceptedMember(s);
    await call('revoke_grocery_haul_invitation', s.owner.personId, s.haulId, revoked.invitationId);
    const stranger = await fixture.linkedPerson();

    for (const actor of [pending.personId, revoked.person.personId, stranger.personId, s.owner.personId]) {
      await expect(
        call('add_grocery_haul_contributor_item', actor, s.haulId, 'Nope', 1, null),
      ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    }
    expect(await contributorItems(s.haulId)).toEqual([]);
  });

  it('rejects contributor writes to a missing Haul and to another owner Haul', async () => {
    const s = await scenario(['Beans']);
    const t = await scenario(['Peas']);
    const member = await acceptedMember(s);
    await expect(
      call('add_grocery_haul_contributor_item', member.person.personId, t.haulId, 'Cross', 1, null),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    await expect(
      call(
        'add_grocery_haul_contributor_item', member.person.personId,
        '00000000-0000-4000-8000-000000000000', 'Ghost', 1, null,
      ),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
  });

  it('enforces attribution, membership and Draft status at the table itself', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const outsider = await fixture.linkedPerson();

    const insert = (addedBy: string | null) =>
      svc.query(
        `INSERT INTO public.grocery_haul_items
           (haul_id, person_id, name_snapshot, source_status_snapshot, origin_type, added_by_person_id)
         VALUES ($1, $2, 'Direct', 'pending', 'haul_contributor', $3)`,
        [s.haulId, s.owner.personId, addedBy],
      );
    await expect(insert(null)).rejects.toThrow(/HAUL_CONTRIBUTOR_ATTRIBUTION_REQUIRED/);
    await expect(insert(outsider.personId)).rejects.toThrow(/HAUL_CONTRIBUTOR_NOT_MEMBER/);
    // The owner cannot mint Haul-only items in v1 either: not a member of their own Haul.
    await expect(insert(s.owner.personId)).rejects.toThrow(/HAUL_CONTRIBUTOR_NOT_MEMBER/);
    await insert(member.person.personId);

    await fixture.sql(`UPDATE public.grocery_hauls SET status = 'active' WHERE id = $1`, [s.haulId]);
    await expect(insert(member.person.personId)).rejects.toThrow(/HAUL_CONTRIBUTOR_NOT_DRAFT/);
  });

  it('rejects invalid item content and enforces the per-contributor item cap', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const add = (name: unknown, quantity: unknown, unit: unknown) =>
      call('add_grocery_haul_contributor_item', member.person.personId, s.haulId, name, quantity, unit);

    await expect(add('   ', 1, null)).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);
    await expect(add('x'.repeat(201), 1, null)).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);
    await expect(add('ok', 0, null)).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);
    await expect(add('ok', -2, null)).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);
    await expect(add('ok', 100001, null)).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);
    await expect(add('ok', 1, 'u'.repeat(41))).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);

    await svc.query(
      `INSERT INTO public.grocery_haul_items
         (haul_id, person_id, name_snapshot, source_status_snapshot, origin_type, added_by_person_id)
       SELECT $1, $2, 'bulk ' || g, 'pending', 'haul_contributor', $3
       FROM generate_series(1, 100) g`,
      [s.haulId, s.owner.personId, member.person.personId],
    );
    await expect(add('one too many', 1, null)).rejects.toThrow(/HAUL_CONTRIBUTOR_ITEM_LIMIT/);
  });

  it('lets a contributor edit only their own item, and never source snapshot rows', async () => {
    const s = await scenario(['Beans']);
    const alice = await acceptedMember(s);
    const bob = await acceptedMember(s);
    const aliceItem = await call<Record<string, any>>(
      'add_grocery_haul_contributor_item', alice.person.personId, s.haulId, 'Milk', 1, 'l',
    );

    const edited = await updateItem(alice.person.personId, s.haulId, aliceItem.id, {
      name: 'Oat milk', quantity: 4, unit: null,
    });
    expect(edited).toMatchObject({ name_snapshot: 'Oat milk', unit_snapshot: null, added_by_person_id: alice.person.personId });
    expect(Number(edited.quantity_snapshot)).toBe(4);
    expect(Number(edited.final_quantity)).toBe(4);

    await expect(
      updateItem(bob.person.personId, s.haulId, aliceItem.id, { name: 'Hijack' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    await expect(
      updateItem(alice.person.personId, s.haulId, s.snapshotItemId, { name: 'Snapshot edit' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    await expect(
      updateItem(alice.person.personId, s.haulId, '00000000-0000-4000-8000-000000000000', { name: 'x' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_ITEM_NOT_FOUND/);
    await expect(
      updateItem(alice.person.personId, s.haulId, aliceItem.id, { quantity: 'many' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);
    await expect(
      updateItem(alice.person.personId, s.haulId, aliceItem.id, { name: '   ' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_INVALID_ITEM/);

    // Untouched by the failed attempts.
    const [row] = await contributorItems(s.haulId);
    expect(row.name_snapshot).toBe('Oat milk');
  });

  it('never overwrites an owner adjustment to the purchase quantity', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>(
      'add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Eggs', 2, null,
    );
    // Owner excludes the line (final_quantity 0) through ordinary preparation edit.
    await svc.query(`UPDATE public.grocery_haul_items SET final_quantity = 0 WHERE id = $1`, [item.id]);
    const edited = await updateItem(member.person.personId, s.haulId, item.id, { quantity: 6 });
    expect(Number(edited.quantity_snapshot)).toBe(6);
    expect(Number(edited.final_quantity)).toBe(0);
  });

  it('lets the owner edit and remove any contributor item but no snapshot row', async () => {
    const s = await scenario(['Beans']);
    const alice = await acceptedMember(s);
    const bob = await acceptedMember(s);
    const a = await call<Record<string, any>>('add_grocery_haul_contributor_item', alice.person.personId, s.haulId, 'A', 1, null);
    const b = await call<Record<string, any>>('add_grocery_haul_contributor_item', bob.person.personId, s.haulId, 'B', 1, null);

    const edited = await updateItem(s.owner.personId, s.haulId, a.id, { name: 'A (owner edit)' });
    expect(edited.name_snapshot).toBe('A (owner edit)');
    expect(edited.added_by_person_id).toBe(alice.person.personId); // attribution never rewritten

    const removed = await call('remove_grocery_haul_contributor_item', s.owner.personId, s.haulId, b.id);
    expect(removed.outcome).toBe('removed');
    await expect(
      call('remove_grocery_haul_contributor_item', s.owner.personId, s.haulId, s.snapshotItemId),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    await expect(
      updateItem(s.owner.personId, s.haulId, s.snapshotItemId, { name: 'no' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
  });

  it('lets a contributor remove only their own item', async () => {
    const s = await scenario(['Beans']);
    const alice = await acceptedMember(s);
    const bob = await acceptedMember(s);
    const a = await call<Record<string, any>>('add_grocery_haul_contributor_item', alice.person.personId, s.haulId, 'A', 1, null);

    await expect(
      call('remove_grocery_haul_contributor_item', bob.person.personId, s.haulId, a.id),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    await expect(
      call('remove_grocery_haul_contributor_item', alice.person.personId, s.haulId, s.snapshotItemId),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    expect(await contributorItems(s.haulId)).toHaveLength(1);

    await call('remove_grocery_haul_contributor_item', alice.person.personId, s.haulId, a.id);
    expect(await contributorItems(s.haulId)).toHaveLength(0);
    const snapshot = await fixture.sql(
      `SELECT id FROM public.grocery_haul_items WHERE haul_id = $1 AND origin_type = 'source_list_snapshot'`,
      [s.haulId],
    );
    expect(snapshot).toHaveLength(1);
  });

  it('cannot re-parent, re-attribute or re-originate an item, even as service_role', async () => {
    const s = await scenario(['Beans']);
    const t = await scenario(['Peas']);
    const alice = await acceptedMember(s);
    const bob = await acceptedMember(s);
    const item = await call<Record<string, any>>('add_grocery_haul_contributor_item', alice.person.personId, s.haulId, 'A', 1, null);

    const attempt = (sql: string, ...values: unknown[]) => svc.query(sql, [item.id, ...values]);
    await expect(
      attempt(`UPDATE public.grocery_haul_items SET added_by_person_id = $2 WHERE id = $1`, bob.person.personId),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE/);
    await expect(
      attempt(`UPDATE public.grocery_haul_items SET origin_type = 'source_list_snapshot' WHERE id = $1`),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE/);
    await expect(
      attempt(`UPDATE public.grocery_haul_items SET haul_id = $2 WHERE id = $1`, t.haulId),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE|foreign key/i);
    await expect(
      attempt(`UPDATE public.grocery_haul_items SET person_id = $2 WHERE id = $1`, t.owner.personId),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE|foreign key/i);
    await expect(
      attempt(`UPDATE public.grocery_haul_items SET source_grocery_list_id = $2 WHERE id = $1`, s.listId),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE|origin_coherent/);
    await expect(
      attempt(`UPDATE public.grocery_haul_items SET grocery_item_id = $2 WHERE id = $1`, s.itemIds[0]),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE|origin_coherent/);
    await expect(
      attempt(`UPDATE public.grocery_haul_items SET source_status_snapshot = 'have' WHERE id = $1`),
    ).rejects.toThrow(/HAUL_ITEM_SNAPSHOT_IMMUTABLE|origin_coherent/);
  });

  it('blocks contributor edits and removal once the Haul leaves Draft', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'A', 1, null);
    await fixture.sql(`UPDATE public.grocery_hauls SET status = 'active' WHERE id = $1`, [s.haulId]);

    await expect(
      call('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'B', 1, null),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_NOT_DRAFT/);
    await expect(
      updateItem(member.person.personId, s.haulId, item.id, { name: 'C' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_NOT_DRAFT/);
    await expect(
      call('remove_grocery_haul_contributor_item', member.person.personId, s.haulId, item.id),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_NOT_DRAFT/);
    // Even a direct content write cannot ride the active-Haul preparation path.
    await expect(
      svc.query(`UPDATE public.grocery_haul_items SET name_snapshot = 'sneaky' WHERE id = $1`, [item.id]),
    ).rejects.toThrow(/HAUL_PREPARATION_NOT_DRAFT/);
  });

  it('keeps contributor items and attribution after revocation, and freezes access', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Kept', 2, null);
    await call('revoke_grocery_haul_invitation', s.owner.personId, s.haulId, member.invitationId);

    const [kept] = await contributorItems(s.haulId);
    expect(kept.id).toBe(item.id);
    expect(kept.added_by_person_id).toBe(member.person.personId);

    await expect(
      call('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'More', 1, null),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    await expect(
      updateItem(member.person.personId, s.haulId, item.id, { name: 'Edit' }),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
    await expect(
      call('remove_grocery_haul_contributor_item', member.person.personId, s.haulId, item.id),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_FORBIDDEN/);
  });

  it('preserves attribution through Haul close and through contributor account erasure', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Historic', 1, null);
    await call('revoke_grocery_haul_invitation', s.owner.personId, s.haulId, member.invitationId);
    await fixture.sql(`UPDATE public.grocery_hauls SET status = 'closed' WHERE id = $1`, [s.haulId]);

    const [closed] = await contributorItems(s.haulId);
    expect(closed.added_by_person_id).toBe(member.person.personId);
    await expect(
      svc.query(`UPDATE public.grocery_haul_items SET name_snapshot = 'rewrite' WHERE id = $1`, [item.id]),
    ).rejects.toThrow(/HAUL_PREPARATION_HISTORICAL/);
    await expect(
      call('remove_grocery_haul_contributor_item', s.owner.personId, s.haulId, item.id),
    ).rejects.toThrow(/HAUL_CONTRIBUTOR_NOT_DRAFT/);

    // Erasing the contributor's person must not block, and must not erase the
    // owner's Haul history (ON DELETE SET NULL passes the historical guard).
    await fixture.sql(`DELETE FROM public.people WHERE id = $1`, [member.person.personId]);
    const [survivor] = await contributorItems(s.haulId);
    expect(survivor.id).toBe(item.id);
    expect(survivor.name_snapshot).toBe('Historic');
    expect(survivor.added_by_person_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Readiness / estimate inputs / execution with Haul-only items
// ---------------------------------------------------------------------------

describe('readiness and execution with Haul-only items', () => {
  it('counts contributor items as executable in the readiness RPC', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    await call('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Extra', 2, null);

    const readiness = await call<Record<string, any>>(
      'get_grocery_haul_execution_readiness', s.owner.personId, s.haulId,
    );
    expect(readiness.can_start).toBe(true);
    expect(readiness.executable_item_count).toBe(2);
    // The contributor line is subject to the same owner-only readiness rules.
    const codes = (readiness.warnings as Array<Record<string, any>>).map((w) => w.code);
    expect(codes.filter((c) => c === 'missing_price')).toHaveLength(2);
    expect(codes.filter((c) => c === 'missing_purchasing_product')).toHaveLength(2);
  });

  it('excludes a zero-quantity contributor item from readiness and activation', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Skipme', 2, null);
    await svc.query(`UPDATE public.grocery_haul_items SET final_quantity = 0 WHERE id = $1`, [item.id]);

    const readiness = await call<Record<string, any>>('get_grocery_haul_execution_readiness', s.owner.personId, s.haulId);
    expect(readiness.executable_item_count).toBe(1);
    await call('start_grocery_haul_execution', s.owner.personId, s.haulId);
    const seeded = await fixture.sql(
      `SELECT haul_item_id FROM public.grocery_haul_execution_items WHERE haul_id = $1`,
      [s.haulId],
    );
    expect(seeded.map((row) => row.haul_item_id)).not.toContain(item.id);
  });

  it('seeds Shopping View from both origins, with a NULL source List only for Haul-only rows', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Extra', 2, null);

    const started = await call<Record<string, any>>('start_grocery_haul_execution', s.owner.personId, s.haulId);
    expect(started.outcome).toBe('started');
    expect(started.item_count).toBe(2);

    const rows = await fixture.sql<Record<string, any>>(
      `SELECT e.source_grocery_list_id, e.source_name_snapshot, e.haul_item_id, i.origin_type, i.added_by_person_id
         FROM public.grocery_haul_execution_items e
         JOIN public.grocery_haul_items i ON i.id = e.haul_item_id
        WHERE e.haul_id = $1 ORDER BY e.sort_ordinal`,
      [s.haulId],
    );
    expect(rows).toHaveLength(2);
    const snapshot = rows.find((row) => row.origin_type === 'source_list_snapshot')!;
    const haulOnly = rows.find((row) => row.origin_type === 'haul_contributor')!;
    expect(snapshot.source_grocery_list_id).toBe(s.listId);
    expect(haulOnly.source_grocery_list_id).toBeNull();
    expect(haulOnly.haul_item_id).toBe(item.id);
    expect(haulOnly.source_name_snapshot).toBe('Extra');
    // Attribution is reachable after activation and stays on the item.
    expect(haulOnly.added_by_person_id).toBe(member.person.personId);
  });

  it('lets the owner keep preparing a contributor item during shopping while it is pending', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const item = await call<Record<string, any>>('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Extra', 2, null);
    await call('start_grocery_haul_execution', s.owner.personId, s.haulId);

    const updated = await svc.query(
      `UPDATE public.grocery_haul_items SET product_title = 'Brand X', price_amount = 3.5,
              price_currency = 'USD', price_source = 'manual'
        WHERE id = $1 RETURNING product_title`,
      [item.id],
    );
    expect(updated.rows[0].product_title).toBe('Brand X');
  });

  it('pins execution rows to their origin in both directions', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const contributor = await call<Record<string, any>>('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'Extra', 1, null);

    const insertExecution = (itemId: string, sourceListId: string | null) =>
      svc.query(
        `INSERT INTO public.grocery_haul_execution_items (
           person_id, haul_id, haul_item_id, sort_ordinal, source_grocery_list_id,
           source_name_snapshot, prepared_quantity
         ) VALUES ($1, $2, $3, 99, $4, 'n', 1)`,
        [s.owner.personId, s.haulId, itemId, sourceListId],
      );
    await expect(insertExecution(s.snapshotItemId, null)).rejects.toThrow(/HAUL_EXECUTION_SOURCE_MISMATCH/);
    await expect(insertExecution(contributor.id, s.listId)).rejects.toThrow(/HAUL_EXECUTION_SOURCE_MISMATCH/);
    await insertExecution(contributor.id, null);
  });

  it('serializes a contributor add against activation: never half-seeded', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const adder = await fixture.connect();
    const starter = await fixture.connect();
    try {
      await adder.query('SET ROLE service_role');
      await starter.query('SET ROLE service_role');

      // Session A holds the Haul share lock mid-transaction after adding.
      await adder.query('BEGIN');
      const added = await adder.query(
        `SELECT public.add_grocery_haul_contributor_item($1, $2, 'Racer', 1, NULL) AS r`,
        [member.person.personId, s.haulId],
      );
      const itemId = added.rows[0].r.id as string;

      // Session B tries to activate; it must block on the Haul row lock.
      const start = starter.query(`SELECT public.start_grocery_haul_execution($1, $2) AS r`, [
        s.owner.personId,
        s.haulId,
      ]);
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt += 1) {
        const rows = await fixture.sql<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query ILIKE '%start_grocery_haul_execution%'`,
        );
        waiting = rows[0].n > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);

      await adder.query('COMMIT');
      const result = await start;
      expect(result.rows[0].r.item_count).toBe(2);

      const seeded = await fixture.sql<{ haul_item_id: string }>(
        `SELECT haul_item_id FROM public.grocery_haul_execution_items WHERE haul_id = $1`,
        [s.haulId],
      );
      expect(seeded.map((row) => row.haul_item_id)).toContain(itemId);
    } finally {
      await adder.query('ROLLBACK').catch(() => undefined);
      await adder.end();
      await starter.end();
    }
  });

  it('rejects a contributor add that races an in-flight activation: no unseeded item', async () => {
    // Reverse ordering: activation is mid-transaction (Haul row locked, status
    // already 'active' but uncommitted). An add that read 'planned' without a
    // lock could still insert an item that Shopping View never seeded. The
    // explicit Haul share lock makes the add wait, then see the Haul is no
    // longer Draft.
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    const adder = await fixture.connect();
    const starter = await fixture.connect();
    try {
      await adder.query('SET ROLE service_role');
      await starter.query('SET ROLE service_role');

      await starter.query('BEGIN');
      await starter.query(`SELECT public.start_grocery_haul_execution($1, $2)`, [
        s.owner.personId,
        s.haulId,
      ]);

      const add = adder
        .query(`SELECT public.add_grocery_haul_contributor_item($1, $2, 'Late', 1, NULL) AS r`, [
          member.person.personId,
          s.haulId,
        ])
        .then(
          () => ({ ok: true as const, message: '' }),
          (error: Error) => ({ ok: false as const, message: error.message }),
        );

      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt += 1) {
        const rows = await fixture.sql<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query ILIKE '%add_grocery_haul_contributor_item%'`,
        );
        waiting = rows[0].n > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);

      await starter.query('COMMIT');
      const outcome = await add;
      expect(outcome.ok).toBe(false);
      expect(outcome.message).toMatch(/HAUL_CONTRIBUTOR_NOT_DRAFT/);

      const orphaned = await fixture.sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.grocery_haul_items
          WHERE haul_id = $1 AND origin_type = 'haul_contributor'`,
        [s.haulId],
      );
      expect(orphaned[0].n).toBe(0);
    } finally {
      await starter.query('ROLLBACK').catch(() => undefined);
      await adder.query('ROLLBACK').catch(() => undefined);
      await adder.end();
      await starter.end();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Rollback contract
// ---------------------------------------------------------------------------

describe('rollback', () => {
  it('is refused while contributor data exists (never deletes user history)', async () => {
    const s = await scenario(['Beans']);
    const member = await acceptedMember(s);
    await call('add_grocery_haul_contributor_item', member.person.personId, s.haulId, 'History', 1, null);
    const fs = await import('fs');
    const { INVITE_ROLLBACK } = await import('../haulHarness');
    const client = await fixture.connect();
    try {
      await expect(client.query(fs.readFileSync(INVITE_ROLLBACK, 'utf8'))).rejects.toThrow(/ROLLBACK_BLOCKED/);
    } finally {
      await client.end();
    }
    // Nothing was half-applied.
    const rows = await fixture.sql(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'grocery_haul_items' AND column_name = 'origin_type'`,
    );
    expect(rows).toHaveLength(1);
  });
});
