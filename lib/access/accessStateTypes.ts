/**
 * Shared access-state types (pure — safe for client + server).
 *
 * Access STATE is distinct from entitlement keys: it is the high-level
 * subscription status that drives whether active tools are usable vs. the
 * account is in a read-only "saved data" state. Entitlement keys (journal,
 * program:*, feature:*) remain the granular gates.
 */

/** Runtime subscription status for a person. */
export type AppAccessStateName =
  | 'subscriber' // active paid subscription — full active tools + programs
  | 'trialing' // inside trial window — same access as subscriber
  | 'data_access_only' // expired/lapsed — account + saved data read-only, tools locked
  | 'registered_no_access' // known account/person, but no prior app/trial/subscription history
  | 'practitioner' // practitioner-supported premium, layered above baseline
  | 'none'; // no app access yet

/** Why a person resolved to a given access state. Useful for UI/debugging. */
export type AccessStateReason =
  | 'no_person_record'
  | 'known_person_no_offer_history'
  | 'active_trial'
  | 'active_subscription'
  | 'expired_trial'
  | 'lapsed_subscription'
  | 'canceled_subscription'
  | 'past_due_subscription'
  | 'former_practitioner_or_program_user'
  | 'practitioner_supported';

/** What subscribing to an offer grants. */
export type GrantedAccessTier = 'app_plus_programs' | 'practitioner';
