'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { planService } from '@/lib/plans';
import type {
  CreateHaulInvitationResult,
  HaulInvitationRecord,
} from '@/lib/plans/groceryHaul/haulCollaborationClientTypes';
import { buildHaulInviteLandingUrl } from '@/lib/plans/groceryHaul/haulInviteLanding';

interface HaulInviteDialogProps {
  open: boolean;
  haulId: string;
  onClose: () => void;
}

type DeliveryUiState = 'sent' | 'failed' | null;

function memberLabel(invitation: HaulInvitationRecord): string {
  if (invitation.invited_display_name) {
    return `${invitation.invited_display_name} · ${invitation.invited_email}`;
  }
  return invitation.invited_email;
}

function inviteLinkForId(invitationId: string): string {
  return buildHaulInviteLandingUrl(window.location.origin, invitationId);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const node = document.createElement('textarea');
  node.value = value;
  node.setAttribute('readonly', '');
  document.body.appendChild(node);
  node.select();
  document.execCommand('copy');
  document.body.removeChild(node);
}

export function HaulInviteDialog({ open, haulId, onClose }: HaulInviteDialogProps) {
  const [email, setEmail] = useState('');
  const [invitations, setInvitations] = useState<HaulInvitationRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [deliveryByInvitationId, setDeliveryByInvitationId] = useState<
    Record<string, DeliveryUiState>
  >({});
  const [resendBusyId, setResendBusyId] = useState<string | null>(null);
  const [revokeBusyId, setRevokeBusyId] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<CreateHaulInvitationResult | null>(null);
  const busy = inviteBusy || copyBusy;

  const loadInvitations = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const rows = await planService.listHaulInvitations(haulId);
      setInvitations(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load members.');
    } finally {
      setLoadingMembers(false);
    }
  }, [haulId]);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setError(null);
    setLinkNotice(null);
    setLastOutcome(null);
    void loadInvitations();
  }, [open, loadInvitations]);

  const activeMembers = useMemo(
    () => invitations.filter((row) => row.status === 'pending' || row.status === 'accepted'),
    [invitations],
  );

  async function sendInvite() {
    if (busy || !email.trim()) return;
    setInviteBusy(true);
    setError(null);
    setLinkNotice(null);
    setLastOutcome(null);
    try {
      const result = await planService.createHaulInvitation(haulId, email.trim());
      setLastOutcome(result);
      if (result.email === 'failed') {
        setDeliveryByInvitationId((current) => ({
          ...current,
          [result.invitation_id]: 'failed',
        }));
      } else if (result.email === 'sent') {
        setDeliveryByInvitationId((current) => ({
          ...current,
          [result.invitation_id]: 'sent',
        }));
      }
      setEmail('');
      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send this invitation.');
    } finally {
      setInviteBusy(false);
    }
  }

  async function resolveInvitationForLink(): Promise<CreateHaulInvitationResult | null> {
    if (!email.trim()) return null;
    return planService.createHaulInvitation(haulId, email.trim(), { deliver: false });
  }

  async function copyInviteLink() {
    if (busy || !email.trim()) return;
    setCopyBusy(true);
    setError(null);
    setLinkNotice(null);
    setLastOutcome(null);
    try {
      const result = await resolveInvitationForLink();
      if (!result) return;
      setLastOutcome(result);
      if (result.outcome === 'already_member') {
        setLinkNotice('This person is already a member. No invitation link to copy.');
        return;
      }
      const link = inviteLinkForId(result.invitation_id);
      await copyText(link);
      setLinkNotice(
        result.outcome === 'duplicate_pending'
          ? 'Copied the existing pending invitation link.'
          : 'Invitation link copied.',
      );
      setEmail('');
      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to copy this invitation link.');
    } finally {
      setCopyBusy(false);
    }
  }

  async function shareInviteLink() {
    if (busy || !email.trim() || typeof navigator.share !== 'function') return;
    setCopyBusy(true);
    setError(null);
    setLinkNotice(null);
    setLastOutcome(null);
    try {
      const result = await resolveInvitationForLink();
      if (!result) return;
      setLastOutcome(result);
      if (result.outcome === 'already_member') {
        setLinkNotice('This person is already a member. No invitation link to share.');
        return;
      }
      const link = inviteLinkForId(result.invitation_id);
      await navigator.share({
        title: 'Fine Diet Haul invitation',
        text: 'You are invited to help prepare this grocery Haul.',
        url: link,
      });
      setLinkNotice(
        result.outcome === 'duplicate_pending'
          ? 'Shared the existing pending invitation link.'
          : 'Invitation link ready to share.',
      );
      setEmail('');
      await loadInvitations();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unable to share this invitation link.');
    } finally {
      setCopyBusy(false);
    }
  }

  async function copyExistingLink(invitationId: string) {
    if (copyBusy) return;
    setCopyBusy(true);
    setError(null);
    try {
      await copyText(inviteLinkForId(invitationId));
      setLinkNotice('Invitation link copied.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to copy this invitation link.');
    } finally {
      setCopyBusy(false);
    }
  }

  async function resend(invitationId: string) {
    if (resendBusyId) return;
    setResendBusyId(invitationId);
    setError(null);
    try {
      const result = await planService.resendHaulInvitation(haulId, invitationId);
      setDeliveryByInvitationId((current) => ({
        ...current,
        [invitationId]: result.email === 'failed' ? 'failed' : result.email === 'sent' ? 'sent' : current[invitationId] ?? null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend this invitation.');
    } finally {
      setResendBusyId(null);
    }
  }

  async function revoke(invitation: HaulInvitationRecord) {
    if (revokeBusyId) return;
    setRevokeBusyId(invitation.id);
    setError(null);
    try {
      await planService.revokeHaulInvitation(haulId, invitation.id);
      setDeliveryByInvitationId((current) => {
        const next = { ...current };
        delete next[invitation.id];
        return next;
      });
      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove this member.');
    } finally {
      setRevokeBusyId(null);
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="haul-invite-title"
      busy={busy}
      shell="create-resource"
      footer={(
        <div className="flex w-full flex-col items-stretch gap-3">
          <button
            type="button"
            onClick={() => void sendInvite()}
            disabled={!email.trim() || busy}
            className="min-h-11 w-full rounded-full bg-brand-50 px-5 py-2.5 text-sm font-semibold text-[#16110d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {inviteBusy ? 'Sending…' : 'Send invitation'}
          </button>
          <button
            type="button"
            onClick={() => void copyInviteLink()}
            disabled={!email.trim() || busy}
            className="min-h-11 w-full rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white/85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copyBusy ? 'Working…' : 'Copy invite link'}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={() => void shareInviteLink()}
              disabled={!email.trim() || busy}
              className="min-h-10 w-full text-sm font-semibold text-white/70 disabled:opacity-40"
            >
              Share invite link
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-10 w-full text-sm text-white/55 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}
    >
      <h2 id="haul-invite-title" className="text-2xl font-semibold text-white">
        Invite to haul
      </h2>
      <p className="mt-2 text-sm text-white/50">
        Enter their email. The link stays bound to that invitation and still requires them to sign in as that person to join.
      </p>

      <label className="mt-4 block">
        <span className="text-xs text-white/50">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 min-h-11 w-full rounded-full border border-white/20 bg-transparent px-4 text-base text-white outline-none focus:border-white/60 sm:text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}
      {linkNotice && (
        <p className="mt-4 text-sm text-white/60">{linkNotice}</p>
      )}

      {lastOutcome?.outcome === 'already_member' && !linkNotice && (
        <p className="mt-4 text-sm text-white/60">This person is already a member of this Haul.</p>
      )}
      {lastOutcome?.outcome === 'duplicate_pending' && !linkNotice && (
        <p className="mt-4 text-sm text-white/60">
          An invitation is already pending for this email. Use Resend below if they did not receive it.
        </p>
      )}

      <div className="mt-6 border-t border-white/15 pt-4">
        <h3 className="text-sm font-semibold text-white/80">Members</h3>
        {loadingMembers ? (
          <p className="mt-3 text-sm text-white/45">Loading…</p>
        ) : activeMembers.length === 0 ? (
          <p className="mt-3 text-sm text-white/45">No pending or accepted members yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {activeMembers.map((invitation) => {
              const delivery = deliveryByInvitationId[invitation.id];
              const showResend = invitation.status === 'pending';
              return (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/85">{memberLabel(invitation)}</p>
                    <p className="text-xs text-white/45">
                      {invitation.status === 'pending' ? 'Pending' : 'Accepted'}
                      {delivery === 'failed' && ' · Email could not be delivered'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {showResend && (
                      <>
                        <button
                          type="button"
                          disabled={copyBusy}
                          onClick={() => void copyExistingLink(invitation.id)}
                          className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/80 disabled:opacity-50"
                        >
                          Copy link
                        </button>
                        <button
                          type="button"
                          disabled={resendBusyId === invitation.id}
                          onClick={() => void resend(invitation.id)}
                          className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/80 disabled:opacity-50"
                        >
                          {resendBusyId === invitation.id ? 'Sending…' : 'Resend'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={revokeBusyId === invitation.id}
                      onClick={() => void revoke(invitation)}
                      className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/80 disabled:opacity-50"
                    >
                      {revokeBusyId === invitation.id
                        ? 'Removing…'
                        : invitation.status === 'pending'
                          ? 'Revoke'
                          : 'Remove'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ItemManagementDialog>
  );
}
