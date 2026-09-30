import type { GroceryHaulDetail } from '@/lib/plans/types';
import type {
  HaulInvitationStatus,
} from '@/lib/plans/groceryHaul/schema';

export type HaulInviteEmailStatus = 'sent' | 'skipped_not_created' | 'failed';
export type HaulInviteDelivery = 'supabase_auth_invite' | 'transactional_email' | 'none';

export interface HaulInvitationRecord {
  id: string;
  haul_id: string;
  invited_email: string;
  invited_person_id: string | null;
  invited_display_name: string | null;
  role: 'contributor';
  status: HaulInvitationStatus;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
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

export interface ResendHaulInvitationResult {
  invitation_id: string;
  email: HaulInviteEmailStatus;
  delivery: HaulInviteDelivery;
}

export interface SharedGroceryHaulDetail {
  detail: GroceryHaulDetail;
  viewer: { role: 'owner' | 'contributor'; person_id: string };
  contributors: Array<{ person_id: string; display_name: string | null }>;
}
