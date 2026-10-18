/**
 * Browser-safe binding entry. Authoring and the full candidate live in
 * baselineMemberDraftImport.ts and must not be re-exported here.
 */
export {
  BASELINE_MEMBER_DRAFT_VERSION_LABEL,
  PROTECTED_BASELINE_V1,
  UNTOUCHED_BASELINE_DRAFT,
  resolveMemberBlueprintBinding,
} from './baselineMemberBinding';
export type {
  MemberBlueprintBinding,
  MemberBlueprintBindingInput,
  MemberBlueprintLegacyReason,
  MemberBlueprintResponseIdentity,
  MemberBlueprintUnavailableReason,
} from './baselineMemberBinding';
