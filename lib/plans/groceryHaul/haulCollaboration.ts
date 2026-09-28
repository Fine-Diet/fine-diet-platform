/**
 * Invite to Haul v1 (Phase B1) — server-only collaboration service.
 *
 * Boundaries (see scripts/sql/addHaulInviteCollaboration.sql for the DB contract):
 *  - Every write goes through a SECURITY INVOKER, service_role-only RPC that
 *    re-verifies the actor in the database. This module never writes
 *    grocery_haul_invitations or contributor items directly.
 *  - The caller's person id ALWAYS comes from the authenticated session
 *    (requireJournalAuth). Nothing here trusts a client-supplied person id or
 *    email as proof of identity.
 *  - Accepting an invitation additionally requires the Supabase Auth user to
 *    have a CONFIRMED email equal to the invitation target. people.email alone
 *    is not proof of mailbox ownership (link-person does not check
 *    email_confirmed_at), so it is never sufficient.
 *  - Supabase Auth admin calls (inviteUserByEmail, getUserById) are server-only.
 *  - Invitation delivery is transport only and never grants membership. New /
 *    unlinked emails get a Supabase invite whose redirect is the dedicated
 *    non-PKCE landing (haulInviteLanding.ts), NEVER /auth/callback. Existing
 *    accounts NEVER hit inviteUserByEmail (Supabase errors for confirmed users);
 *    they get a transactional Resend email with the same landing link.
 *
 * NEVER import this file from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { GroceryHaulDetail, GroceryHaulItem } from '@/lib/plans/types';
import {
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  getGroceryHaulDetail,
} from './service';
import {
  HAUL_CONTRIBUTOR_ITEM_ADD_RPC_NAME,
  HAUL_CONTRIBUTOR_ITEM_REMOVE_RPC_NAME,
  HAUL_CONTRIBUTOR_ITEM_UPDATE_RPC_NAME,
  HAUL_INVITATIONS_TABLE,
  HAUL_INVITE_ACCEPT_RPC_NAME,
  HAUL_INVITE_CREATE_RPC_NAME,
  HAUL_INVITE_REVOKE_RPC_NAME,
  type HaulInvitationRole,
  type HaulInvitationStatus,
} from './schema';
import { buildHaulInviteLandingUrl } from './haulInviteLanding';
import { sendHaulInviteEmail } from './haulInviteEmail';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HaulViewerRole = 'owner' | 'contributor';

export interface HaulViewerAccess {
  role: HaulViewerRole;
  haulId: string;
  ownerPersonId: string;
  actorPersonId: string;
}

export interface HaulInvitationRecord {
  id: string;
  haul_id: string;
  invited_email: string;
  invited_person_id: string | null;
  invited_display_name: string | null;
  role: HaulInvitationRole;
  status: HaulInvitationStatus;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface HaulPendingInvitationForInvitee {
  invitation_id: string;
  haul_id: string;
  haul_title: string | null;
  shopping_date: string | null;
  owner_display_name: string | null;
  invited_at: string;
}

/** Whether an invitation message was handed to a mail provider. */
export type HaulInviteEmailStatus = 'sent' | 'skipped_not_created' | 'failed';

/**
 * Which transport carried (or would have carried) the invitation link:
 *  - supabase_auth_invite: new/unlinked email, Supabase invite -> dedicated landing (non-PKCE)
 *  - transactional_email:  existing account (or Auth-invite fallback), Resend -> same landing
 *  - none:                 nothing sent (duplicate/already member) or every transport failed
 */
export type HaulInviteDelivery = 'supabase_auth_invite' | 'transactional_email' | 'none';

export interface HaulInviteDeliveryResult {
  email: HaulInviteEmailStatus;
  delivery: HaulInviteDelivery;
}

export interface CreateHaulInvitationResult {
  invitation_id: string;
  haul_id: string;
  status: HaulInvitationStatus;
  invited_email: string;
  invited_account_linked: boolean;
  outcome: 'created' | 'duplicate_pending' | 'already_member';
  email: HaulInviteEmailStatus;
  delivery: HaulInviteDelivery;
}

export interface HaulContributorAttribution {
  person_id: string;
  display_name: string | null;
}

export interface SharedGroceryHaulDetail {
  detail: GroceryHaulDetail;
  viewer: { role: HaulViewerRole; person_id: string };
  contributors: HaulContributorAttribution[];
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function rpcCode(error: { message?: string } | null): string {
  return (error?.message ?? '').trim();
}

/**
 * Maps a database error code to an application error. Unknown errors are
 * re-thrown as generic errors so they surface as 500s (never leak SQL text).
 */
export function mapCollaborationRpcError(
  error: { message?: string } | null,
  fallback: string,
): never {
  const code = rpcCode(error);
  switch (code) {
    case 'HAUL_INVITE_INVALID_EMAIL':
      throw new GroceryHaulValidationError('Enter a valid email address.');
    case 'HAUL_INVITE_INVALID_ARGS':
    case 'HAUL_CONTRIBUTOR_INVALID_ARGS':
      throw new GroceryHaulValidationError('Invalid request.');
    case 'HAUL_CONTRIBUTOR_INVALID_ITEM':
      throw new GroceryHaulValidationError(
        'Item needs a name (200 characters max), a positive quantity, and a unit of 40 characters or fewer.',
      );
    case 'HAUL_INVITE_SELF':
      throw new GroceryHaulValidationError('You cannot invite yourself to your own Haul.');
    case 'HAUL_INVITE_LIMIT':
      throw new GroceryHaulConflictError('Invitation limit reached. Revoke an invitation first.');
    case 'HAUL_CONTRIBUTOR_ITEM_LIMIT':
      throw new GroceryHaulConflictError('Item limit reached for this Haul.');
    case 'HAUL_INVITE_NOT_DRAFT':
      throw new GroceryHaulConflictError('People can only be invited while the Haul is a Draft.');
    case 'HAUL_CONTRIBUTOR_NOT_DRAFT':
      throw new GroceryHaulConflictError('Items can only be changed while the Haul is a Draft.');
    case 'HAUL_INVITE_HAUL_NOT_OPEN':
      throw new GroceryHaulConflictError('This Haul is no longer open.');
    case 'HAUL_INVITE_REVOKED':
      throw new GroceryHaulConflictError('This invitation is no longer valid.');
    case 'HAUL_INVITE_ACCOUNT_NOT_LINKED':
      throw new GroceryHaulConflictError('Finish setting up your account, then accept again.');
    // Not found and forbidden deliberately collapse to the same public shape
    // where revealing existence would leak another user's Haul.
    case 'HAUL_INVITE_NOT_FOUND':
    case 'HAUL_CONTRIBUTOR_ITEM_NOT_FOUND':
      throw new GroceryHaulNotFoundError('Not found.');
    case 'HAUL_INVITE_IDENTITY_MISMATCH':
      throw new GroceryHaulForbiddenError(
        'This invitation was sent to a different email address.',
      );
    case 'HAUL_INVITE_FORBIDDEN':
    case 'HAUL_CONTRIBUTOR_FORBIDDEN':
      throw new GroceryHaulForbiddenError('You do not have access to change this.');
    default:
      throw new Error(`${fallback}: ${code || 'unknown error'}`);
  }
}

function asRecord(data: unknown, what: string): Record<string, unknown> {
  const value = typeof data === 'string' ? (JSON.parse(data) as unknown) : data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${what} returned no result.`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function displayName(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const first = typeof row.first_name === 'string' ? row.first_name.trim() : '';
  const last = typeof row.last_name === 'string' ? row.last_name.trim() : '';
  const full = `${first} ${last}`.trim();
  return full || null;
}

export function normalizeInviteEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new GroceryHaulValidationError('Enter a valid email address.');
  }
  const email = value.trim().toLowerCase();
  // Intentionally the same shape the database CHECK enforces; the database is authoritative.
  if (email.length === 0 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new GroceryHaulValidationError('Enter a valid email address.');
  }
  return email;
}

// ---------------------------------------------------------------------------
// Membership-aware access resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the caller's role on a Haul from the database.
 *
 *  - owner:       grocery_hauls.person_id = caller
 *  - contributor: an ACCEPTED grocery_haul_invitations row for the caller
 *  - null:        anything else (including pending, revoked, or unknown Hauls)
 *
 * Callers must treat null as "not found" (404), never as "forbidden", so Haul
 * existence is not disclosed to non-members.
 */
export async function resolveHaulViewerAccess(
  actorPersonId: string,
  haulId: string,
): Promise<HaulViewerAccess | null> {
  const { data: haul, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('id, person_id')
    .eq('id', haulId)
    .maybeSingle();
  if (error) throw new Error(`Failed to resolve Haul access: ${error.message}`);
  if (!haul) return null;

  const ownerPersonId = String(haul.person_id);
  if (ownerPersonId === actorPersonId) {
    return { role: 'owner', haulId, ownerPersonId, actorPersonId };
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from(HAUL_INVITATIONS_TABLE)
    .select('id')
    .eq('haul_id', haulId)
    .eq('invited_person_id', actorPersonId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (membershipError) {
    throw new Error(`Failed to resolve Haul membership: ${membershipError.message}`);
  }
  if (!membership) return null;
  return { role: 'contributor', haulId, ownerPersonId, actorPersonId };
}

// ---------------------------------------------------------------------------
// Owner: invitations
// ---------------------------------------------------------------------------

function mapInvitation(
  row: Record<string, unknown>,
  names: Map<string, string | null>,
): HaulInvitationRecord {
  const invitedPersonId = str(row.invited_person_id);
  return {
    id: String(row.id),
    haul_id: String(row.haul_id),
    invited_email: String(row.invited_email_normalized),
    invited_person_id: invitedPersonId,
    invited_display_name: invitedPersonId ? names.get(invitedPersonId) ?? null : null,
    role: 'contributor',
    status: row.status as HaulInvitationStatus,
    invited_at: String(row.invited_at),
    accepted_at: str(row.accepted_at),
    revoked_at: str(row.revoked_at),
  };
}

async function loadPersonNames(personIds: string[]): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const unique = Array.from(new Set(personIds.filter(Boolean)));
  if (unique.length === 0) return names;
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('id, first_name, last_name')
    .in('id', unique);
  if (error) throw new Error(`Failed to load people names: ${error.message}`);
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    names.set(String(row.id), displayName(row));
  }
  return names;
}

/** Owner view: every invitation for the Haul (pending, accepted, revoked history). */
export async function listHaulInvitationsForOwner(args: {
  ownerPersonId: string;
  haulId: string;
}): Promise<HaulInvitationRecord[]> {
  const { data: haul, error: haulError } = await supabaseAdmin
    .from('grocery_hauls')
    .select('id')
    .eq('id', args.haulId)
    .eq('person_id', args.ownerPersonId)
    .maybeSingle();
  if (haulError) throw new Error(`Failed to load grocery haul: ${haulError.message}`);
  if (!haul) throw new GroceryHaulNotFoundError('Grocery haul not found.');

  const { data, error } = await supabaseAdmin
    .from(HAUL_INVITATIONS_TABLE)
    .select('*')
    .eq('haul_id', args.haulId)
    .eq('owner_person_id', args.ownerPersonId)
    .order('invited_at', { ascending: true });
  if (error) throw new Error(`Failed to load Haul invitations: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const names = await loadPersonNames(
    rows.map((row) => str(row.invited_person_id)).filter((id): id is string => id !== null),
  );
  return rows.map((row) => mapInvitation(row, names));
}

function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://myfinediet.com';
}

/**
 * Supabase Auth invitation for an email with no linked Fine Diet account.
 * `landingUrl` is the dedicated non-PKCE landing (never /auth/callback).
 * Returns true only when Supabase accepted the invite; never throws.
 */
async function sendSupabaseAuthInvite(email: string, landingUrl: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: landingUrl,
    });
    if (!error) return true;
    console.error('[haulCollaboration] inviteUserByEmail failed:', error.message);
    return false;
  } catch (err) {
    console.error('[haulCollaboration] inviteUserByEmail threw:', err);
    return false;
  }
}

/** Injectable transports (tests); production uses Supabase Auth + Resend. */
export interface HaulInviteTransports {
  sendAuthInvite?: (email: string, landingUrl: string) => Promise<boolean>;
  sendEmail?: (args: {
    to: string;
    inviteUrl: string;
    ownerName: string | null;
  }) => Promise<'sent' | 'failed'>;
}

/**
 * Deliver the invitation link. Transport only: the invitation row already
 * exists and is the sole source of truth, so a delivery failure never rolls it
 * back, and nothing here can create membership.
 *
 *  - Existing linked account: transactional email ONLY. inviteUserByEmail is
 *    never called (Supabase errors when inviting an existing confirmed user).
 *  - New / unlinked email: Supabase Auth invite -> dedicated landing. If that
 *    fails for any reason (e.g. the address is registered but not linked),
 *    fall back to the transactional email with the same landing link.
 */
async function deliverHaulInvite(args: {
  ownerPersonId: string;
  email: string;
  invitationId: string;
  accountLinked: boolean;
  transports: HaulInviteTransports;
}): Promise<HaulInviteDeliveryResult> {
  const failed: HaulInviteDeliveryResult = { email: 'failed', delivery: 'none' };
  let landingUrl: string;
  try {
    landingUrl = buildHaulInviteLandingUrl(siteBaseUrl(), args.invitationId);
  } catch (err) {
    console.error('[haulCollaboration] invalid invitation id for landing URL:', err);
    return failed;
  }

  const sendTransactional = async (): Promise<HaulInviteDeliveryResult> => {
    let ownerName: string | null = null;
    try {
      ownerName = (await loadPersonNames([args.ownerPersonId])).get(args.ownerPersonId) ?? null;
    } catch {
      ownerName = null;
    }
    const result = await (args.transports.sendEmail ?? sendHaulInviteEmail)({
      to: args.email,
      inviteUrl: landingUrl,
      ownerName,
    });
    return result === 'sent'
      ? { email: 'sent', delivery: 'transactional_email' }
      : failed;
  };

  if (args.accountLinked) return sendTransactional();

  const authInvited = await (args.transports.sendAuthInvite ?? sendSupabaseAuthInvite)(
    args.email,
    landingUrl,
  );
  if (authInvited) return { email: 'sent', delivery: 'supabase_auth_invite' };
  return sendTransactional();
}

export async function createHaulInvitation(args: {
  ownerPersonId: string;
  haulId: string;
  email: unknown;
  transports?: HaulInviteTransports;
}): Promise<CreateHaulInvitationResult> {
  const email = normalizeInviteEmail(args.email);
  const { data, error } = await supabaseAdmin.rpc(HAUL_INVITE_CREATE_RPC_NAME, {
    p_actor_person_id: args.ownerPersonId,
    p_haul_id: args.haulId,
    p_email: email,
  });
  if (error) mapCollaborationRpcError(error, 'Failed to create Haul invitation');

  const record = asRecord(data, 'Haul invitation create');
  const invitationId = str(record.invitation_id);
  const outcome = record.outcome;
  if (
    !invitationId
    || (outcome !== 'created' && outcome !== 'duplicate_pending' && outcome !== 'already_member')
  ) {
    throw new Error('Haul invitation create returned an incomplete result.');
  }
  const accountLinked = record.invited_account_linked === true;

  // Duplicate pending / already-member: rules unchanged, nothing is (re)sent.
  const delivery: HaulInviteDeliveryResult =
    outcome !== 'created'
      ? { email: 'skipped_not_created', delivery: 'none' }
      : await deliverHaulInvite({
          ownerPersonId: args.ownerPersonId,
          email,
          invitationId,
          accountLinked,
          transports: args.transports ?? {},
        });

  return {
    invitation_id: invitationId,
    haul_id: String(record.haul_id),
    status: record.status as HaulInvitationStatus,
    invited_email: String(record.invited_email_normalized ?? email),
    invited_account_linked: accountLinked,
    outcome,
    email: delivery.email,
    delivery: delivery.delivery,
  };
}

export async function revokeHaulInvitation(args: {
  ownerPersonId: string;
  haulId: string;
  invitationId: string;
}): Promise<{ invitation_id: string; outcome: 'revoked' | 'noop' }> {
  const { data, error } = await supabaseAdmin.rpc(HAUL_INVITE_REVOKE_RPC_NAME, {
    p_actor_person_id: args.ownerPersonId,
    p_haul_id: args.haulId,
    p_invitation_id: args.invitationId,
  });
  if (error) mapCollaborationRpcError(error, 'Failed to revoke Haul invitation');
  const record = asRecord(data, 'Haul invitation revoke');
  const outcome = record.outcome;
  if (outcome !== 'revoked' && outcome !== 'noop') {
    throw new Error('Haul invitation revoke returned an incomplete result.');
  }
  return { invitation_id: String(record.invitation_id), outcome };
}

// ---------------------------------------------------------------------------
// Invitee: pending list and acceptance
// ---------------------------------------------------------------------------

/**
 * Pending invitations addressed to the caller. Matches by the caller's linked
 * person id OR the caller's own people.email (normalized), so an invitation
 * created before the caller had an account is still visible after sign-up.
 * Visibility is not acceptance: accepting still runs the identity checks.
 */
export async function listPendingHaulInvitationsForPerson(
  actorPersonId: string,
): Promise<HaulPendingInvitationForInvitee[]> {
  const { data: person, error: personError } = await supabaseAdmin
    .from('people')
    .select('email')
    .eq('id', actorPersonId)
    .maybeSingle();
  if (personError) throw new Error(`Failed to load person: ${personError.message}`);
  const email = typeof person?.email === 'string' ? person.email.trim().toLowerCase() : '';

  // Two plain equality queries (no string-built filter) merged by id.
  const byPerson = await supabaseAdmin
    .from(HAUL_INVITATIONS_TABLE)
    .select('*')
    .eq('status', 'pending')
    .eq('invited_person_id', actorPersonId);
  if (byPerson.error) {
    throw new Error(`Failed to load Haul invitations: ${byPerson.error.message}`);
  }
  const byEmail = email
    ? await supabaseAdmin
        .from(HAUL_INVITATIONS_TABLE)
        .select('*')
        .eq('status', 'pending')
        .eq('invited_email_normalized', email)
    : { data: [] as unknown[], error: null };
  if (byEmail.error) {
    throw new Error(`Failed to load Haul invitations: ${byEmail.error.message}`);
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(byPerson.data ?? []), ...(byEmail.data ?? [])] as Array<
    Record<string, unknown>
  >) {
    merged.set(String(row.id), row);
  }
  const rows = Array.from(merged.values())
    .filter((row) => String(row.owner_person_id) !== actorPersonId)
    .sort((a, b) => String(b.invited_at).localeCompare(String(a.invited_at)));
  if (rows.length === 0) return [];

  const haulIds = Array.from(new Set(rows.map((row) => String(row.haul_id))));
  const { data: hauls, error: haulsError } = await supabaseAdmin
    .from('grocery_hauls')
    .select('id, title, shopping_date')
    .in('id', haulIds);
  if (haulsError) throw new Error(`Failed to load grocery hauls: ${haulsError.message}`);
  const haulById = new Map(
    ((hauls ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
  );
  const names = await loadPersonNames(rows.map((row) => String(row.owner_person_id)));

  return rows.map((row) => {
    const haul = haulById.get(String(row.haul_id));
    return {
      invitation_id: String(row.id),
      haul_id: String(row.haul_id),
      haul_title: haul ? str(haul.title) : null,
      shopping_date: haul ? str(haul.shopping_date) : null,
      owner_display_name: names.get(String(row.owner_person_id)) ?? null,
      invited_at: String(row.invited_at),
    };
  });
}

export interface ConfirmedAuthEmailLookup {
  (authUserId: string): Promise<{ email: string | null; confirmed: boolean }>;
}

const lookupConfirmedAuthEmail: ConfirmedAuthEmailLookup = async (authUserId) => {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (error || !data?.user) {
    throw new Error(`Failed to verify account email: ${error?.message ?? 'user not found'}`);
  }
  const user = data.user;
  return {
    email: typeof user.email === 'string' ? user.email.trim().toLowerCase() : null,
    confirmed: Boolean(user.email_confirmed_at),
  };
};

/**
 * Accept an invitation as the authenticated caller.
 *
 * Requirements (all enforced; the first three here, the rest in the RPC/trigger):
 *  1. The Auth user's email is confirmed (mailbox ownership proven).
 *  2. The confirmed Auth email equals the invitation's normalized target.
 *  3. The caller's linked people.email equals the invitation target.
 *  4. people.auth_user_id is set (RPC) and not the Haul owner (RPC).
 *  5. The Haul is still open and the invitation is not revoked (RPC/trigger).
 */
export async function acceptHaulInvitation(args: {
  actorPersonId: string;
  authUserId: string;
  invitationId: string;
  lookupAuthEmail?: ConfirmedAuthEmailLookup;
}): Promise<{ invitation_id: string; haul_id: string; outcome: 'accepted' | 'already_accepted' }> {
  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from(HAUL_INVITATIONS_TABLE)
    .select('id, invited_email_normalized')
    .eq('id', args.invitationId)
    .maybeSingle();
  if (invitationError) {
    throw new Error(`Failed to load Haul invitation: ${invitationError.message}`);
  }
  if (!invitation) throw new GroceryHaulNotFoundError('Not found.');

  const authEmail = await (args.lookupAuthEmail ?? lookupConfirmedAuthEmail)(args.authUserId);
  if (!authEmail.confirmed) {
    throw new GroceryHaulForbiddenError('Confirm your email address before accepting.');
  }
  if (authEmail.email !== String(invitation.invited_email_normalized)) {
    // Same shape as the database mismatch so the API does not reveal the target address.
    throw new GroceryHaulForbiddenError('This invitation was sent to a different email address.');
  }

  const { data, error } = await supabaseAdmin.rpc(HAUL_INVITE_ACCEPT_RPC_NAME, {
    p_actor_person_id: args.actorPersonId,
    p_invitation_id: args.invitationId,
  });
  if (error) mapCollaborationRpcError(error, 'Failed to accept Haul invitation');
  const record = asRecord(data, 'Haul invitation accept');
  const outcome = record.outcome;
  if (outcome !== 'accepted' && outcome !== 'already_accepted') {
    throw new Error('Haul invitation accept returned an incomplete result.');
  }
  return {
    invitation_id: String(record.invitation_id),
    haul_id: String(record.haul_id),
    outcome,
  };
}

// ---------------------------------------------------------------------------
// Contributor (and owner) item mutations — Haul-only, never grocery_items
// ---------------------------------------------------------------------------

export interface HaulContributorItemInput {
  name: string;
  quantity?: number | null;
  unit?: string | null;
}

export interface HaulContributorItemPatch {
  name?: string;
  quantity?: number;
  unit?: string | null;
}

function validateItemFields(input: {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
}): void {
  if (input.name !== undefined && typeof input.name !== 'string') {
    throw new GroceryHaulValidationError('Item name must be text.');
  }
  if (
    input.quantity !== undefined
    && input.quantity !== null
    && (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity))
  ) {
    throw new GroceryHaulValidationError('Quantity must be a number.');
  }
  if (input.unit !== undefined && input.unit !== null && typeof input.unit !== 'string') {
    throw new GroceryHaulValidationError('Unit must be text.');
  }
}

export async function addHaulContributorItem(args: {
  actorPersonId: string;
  haulId: string;
  item: HaulContributorItemInput;
}): Promise<GroceryHaulItem> {
  validateItemFields(args.item);
  const { data, error } = await supabaseAdmin.rpc(HAUL_CONTRIBUTOR_ITEM_ADD_RPC_NAME, {
    p_actor_person_id: args.actorPersonId,
    p_haul_id: args.haulId,
    p_name: args.item.name,
    p_quantity: args.item.quantity ?? null,
    p_unit: args.item.unit ?? null,
  });
  if (error) mapCollaborationRpcError(error, 'Failed to add Haul item');
  return asRecord(data, 'Haul item add') as unknown as GroceryHaulItem;
}

export async function updateHaulContributorItem(args: {
  actorPersonId: string;
  haulId: string;
  itemId: string;
  patch: HaulContributorItemPatch;
}): Promise<GroceryHaulItem> {
  validateItemFields(args.patch);
  // Only the three content fields are ever forwarded. Provenance columns
  // (origin_type, added_by_person_id, haul_id, person_id, source_*) cannot be
  // smuggled in: the RPC ignores unknown keys and the DB trigger forbids them.
  const patch: Record<string, unknown> = {};
  if (args.patch.name !== undefined) patch.name = args.patch.name;
  if (args.patch.quantity !== undefined) patch.quantity = args.patch.quantity;
  if (args.patch.unit !== undefined) patch.unit = args.patch.unit;
  if (Object.keys(patch).length === 0) {
    throw new GroceryHaulValidationError('Nothing to update.');
  }
  const { data, error } = await supabaseAdmin.rpc(HAUL_CONTRIBUTOR_ITEM_UPDATE_RPC_NAME, {
    p_actor_person_id: args.actorPersonId,
    p_haul_id: args.haulId,
    p_item_id: args.itemId,
    p_patch: patch,
  });
  if (error) mapCollaborationRpcError(error, 'Failed to update Haul item');
  return asRecord(data, 'Haul item update') as unknown as GroceryHaulItem;
}

export async function removeHaulContributorItem(args: {
  actorPersonId: string;
  haulId: string;
  itemId: string;
}): Promise<{ item_id: string; outcome: 'removed' }> {
  const { data, error } = await supabaseAdmin.rpc(HAUL_CONTRIBUTOR_ITEM_REMOVE_RPC_NAME, {
    p_actor_person_id: args.actorPersonId,
    p_haul_id: args.haulId,
    p_item_id: args.itemId,
  });
  if (error) mapCollaborationRpcError(error, 'Failed to remove Haul item');
  const record = asRecord(data, 'Haul item remove');
  if (record.outcome !== 'removed') {
    throw new Error('Haul item remove returned an incomplete result.');
  }
  return { item_id: String(record.item_id), outcome: 'removed' };
}

// ---------------------------------------------------------------------------
// Shared read — reuses the existing owner Haul detail read model
// ---------------------------------------------------------------------------

/**
 * Haul detail for the owner OR an accepted contributor. Membership is verified
 * first; the existing owner read model (getGroceryHaulDetail) is then reused
 * scoped to the OWNER id, so there is no parallel read model to drift.
 * Non-members receive GroceryHaulNotFoundError (404), never a distinguishable 403.
 */
export async function getSharedGroceryHaulDetail(args: {
  actorPersonId: string;
  haulId: string;
}): Promise<SharedGroceryHaulDetail> {
  const access = await resolveHaulViewerAccess(args.actorPersonId, args.haulId);
  if (!access) throw new GroceryHaulNotFoundError('Grocery haul not found.');

  const detail = await getGroceryHaulDetail(access.ownerPersonId, args.haulId);
  const contributorIds = Array.from(
    new Set(
      detail.items
        .map((item) => item.added_by_person_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
  const names = await loadPersonNames(contributorIds);
  return {
    detail,
    viewer: { role: access.role, person_id: access.actorPersonId },
    contributors: contributorIds.map((id) => ({
      person_id: id,
      display_name: names.get(id) ?? null,
    })),
  };
}
