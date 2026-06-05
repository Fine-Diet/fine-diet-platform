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
  | 'practitioner' // practitioner-supported premium, layered above baseline
  | 'none'; // no app access yet

/** What subscribing to an offer grants. */
export type GrantedAccessTier = 'app_plus_programs' | 'practitioner';
