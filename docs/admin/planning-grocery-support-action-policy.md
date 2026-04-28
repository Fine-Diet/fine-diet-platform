# Planning/Grocery Support Action Policy

Policy version: `2026-04-packet-65`

This policy governs any future admin/support action that touches planning,
grocery, pantry/on-hand, reusable planning, storage provenance, or retained
legacy planning metadata.

Packet 65 is non-mutating. It defines policy before implementation. It does not
authorize cleanup, repair, backfill, regeneration, deletion, or product-state
mutation.

## Principles

- Visibility comes before action. Operators should use the read-only support
  tools before any future mutation is proposed.
- Product truth remains authoritative. Support tooling must not reinterpret
  Required amount, Still to buy, Buy suggestion, readiness, execution state,
  reusable provenance, import ancestry, or pantry deduction semantics.
- Mutations require a separate implementation packet, explicit approval, QA,
  and audit logging.
- Support actions must be scoped to the smallest safe target, usually one
  person and, when applicable, one table row.
- No support mutation may run from a `GET` endpoint.
- No support mutation may run without an audit log entry.
- Legacy metadata cleanup is not approved by the presence of cleanup candidates.
  Dry-run output is evidence for review only.

## Currently Allowed Read-Only Actions

These actions are allowed for `admin` users today because they are read-only:

| Tool | Route or script | Category | Risk |
| --- | --- | --- | --- |
| Planning/grocery snapshot | `/admin/support/planning-grocery` | `read_only_export` | `read_only` |
| Storage-source audit | `/admin/support/planning-storage-audit` | `read_only_export` | `read_only` |
| Legacy cleanup dry-run | `/admin/support/planning-legacy-cleanup-dry-run` | `read_only_export` | `read_only` |
| Planning/grocery anomalies | `/admin/support/planning-grocery-anomalies` | `read_only_export` | `read_only` |
| Support case export | `/admin/support/planning-grocery-support-case` | `read_only_export` | `read_only` |
| Local support scripts for the above | `scripts/support/*Planning*` | `read_only_export` | `read_only` |

Read-only support actions require admin access but do not require a separate
approval workflow. They must remain `GET` or local read-only scripts and must
not call compatibility helpers that can backfill.

## Future Action Categories

Future categories are design classifications only. None are implemented by
Packet 65.

### Low-Risk Mutation Candidates

Risk: `low_mutation`

Possible future examples:

- Add an internal support note to an audit log.
- Mark an anomaly as reviewed in a support-only table.
- Create a support case record that references read-only output.

Required gates:

- Separate implementation packet.
- Explicit admin UI label that the action is a support mutation.
- Single authorized operator confirmation.
- Audit log entry before or during the action.
- No product-state mutation.
- No action from a `GET` endpoint.

### Moderate Mutation Candidates

Risk: `moderate_mutation`

Possible future examples:

- Disable a single stale grocery ingredient resolution row.
- Clear a single invalid pantry/on-hand row.
- Rerun a single-person compatibility backfill in dry-run-then-apply mode.
- Mark a legacy cleanup candidate as reviewed.

Required gates:

- Separate implementation packet and pre-commit QA.
- Dry-run output when possible.
- Explicit target `person_id`.
- Explicit target table and row ids when applicable.
- Typed confirmation phrase.
- Idempotency key for repeatable actions.
- Audit log with before evidence and result.
- Operator confirmation plus policy-owner review.

### High-Risk Mutation Candidates

Risk: `high_risk`

Possible future examples:

- Remove retained legacy metadata keys for one person after dry-run confirms
  candidate state.
- Repair migrated planning/grocery table rows.
- Rewrite reusable planning rows.
- Regenerate grocery lists for support reasons.

Required gates:

- Separate architecture/policy approval before implementation.
- Separate implementation packet and expanded QA matrix.
- Dry-run output with evidence and stable identifiers.
- Second approver or engineering-admin approval.
- Rollback plan or explicit irreversibility acknowledgement.
- Before-state snapshot hash or compact evidence.
- After-state evidence.
- Audit log for request, approval, dry-run, and application.
- Single-person scope unless explicitly approved otherwise.

### Prohibited Actions

Risk: `prohibited`

These actions must not be implemented unless a future architecture decision
explicitly changes this policy:

- Bulk deletion of `people.metadata`.
- Unscoped cleanup across all users without dry-run and approval.
- Any mutation of derived grocery/readiness truth.
- Manual override of Required amount, Still to buy, or Buy suggestion.
- Changing execution state to force grocery demand.
- Silently merging legacy metadata into active response truth.
- Deleting imported meal ancestry.
- Deleting reusable provenance.
- Deleting journal entries to repair planning state.
- Any mutation without audit logging.
- Any mutation from a `GET` endpoint.
- Any support action exposed to non-admin users.
- Any client-side Supabase write bypassing admin API policy gates.
- Any scheduled cleanup or repair job without separate approval.

## Role And Approval Model

Current role:

- `admin`: may view read-only support pages and run read-only dry-runs.

Future roles or equivalent gates:

- `support_admin`: may request low-risk and, with dry-run evidence, moderate
  support actions after those actions are implemented and approved.
- `engineering_admin`: required for high-risk actions, data repair, cleanup,
  regeneration, or any action with uncertain reversibility.

The app currently relies on generic `admin` for support pages. Future mutating
support actions must not rely on generic `admin` alone. They need a granular
role, explicit policy gate, second approval, or equivalent engineering approval
depending on risk.

Approval expectations:

| Risk | Approval requirement |
| --- | --- |
| `read_only` | Admin access only. |
| `low_mutation` | One authorized operator confirmation and audit log. |
| `moderate_mutation` | Operator confirmation, dry-run when possible, audit log, and policy-owner review. |
| `high_risk` | Dry-run, second approver or engineering-admin approval, audit log, and rollback plan. |
| `prohibited` | No implementation. |

## Confirmation And Dry-Run Requirements

Any future mutating support action must collect:

- Explicit action name.
- Target `person_id`.
- Target table and row ids where applicable.
- Risk level and category.
- Before-state snapshot hash or compact evidence.
- Dry-run output when possible.
- Typed confirmation phrase for moderate and high-risk actions.
- Idempotency key if the action can be retried.
- Rate limiting or single-person scoping where relevant.
- Redacted request payload for audit logging.

Any dry-run must be read-only and must not imply approval to apply the action.

## Audit Log Requirements

Future support mutations and support-action requests must produce audit logs.
The audit log can be implemented in a future packet, but it must include an
equivalent shape:

```ts
{
  id: string;
  created_at: string;
  actor_user_id: string;
  actor_role: string;
  action_name: string;
  action_category: string;
  risk_level: string;
  target_person_id: string | null;
  target_table: string | null;
  target_row_ids: string[];
  request_payload_redacted: Record<string, unknown>;
  dry_run_id: string | null;
  before_evidence: Record<string, unknown>;
  after_evidence: Record<string, unknown> | null;
  result: 'requested' | 'dry_run' | 'applied' | 'failed' | 'rejected';
  failure_reason: string | null;
  approval_actor_user_id: string | null;
  approval_note: string | null;
  policy_version: string;
}
```

Audit evidence should be compact and durable. It should not dump raw
`people.metadata` blobs or large grocery payloads unless a future packet
explicitly approves a redacted storage format.

## Rollback And Reversibility

- Read-only actions need no rollback.
- Low-risk support-only mutations should be reversible or explicitly marked as
  append-only.
- Moderate actions require a rollback note or clear explanation of why rollback
  is unnecessary.
- High-risk actions require a rollback plan before implementation. If an action
  is irreversible, the approval must explicitly say so.

## QA Gates For Future Action Implementation

Any future support mutation packet must include:

- Static scan proving no mutation happens from `GET`.
- Static scan proving no unapproved cleanup, repair, backfill, regenerate, or
  delete path exists.
- Touched-file lint and type/build checks.
- Dry-run test with no mutation.
- Apply-path test against a fixture or isolated target when implementation
  exists.
- Audit-log verification.
- Authorization tests for non-admin, `admin`, and any granular future roles.
- Browser smoke proving no mutation controls appear on read-only pages.

## Escalation Rules

Escalate to engineering before implementation when:

- The action touches retained legacy metadata.
- The action changes migrated planning/grocery tables.
- The action affects grocery/readiness truth.
- The action changes execution state.
- The action is bulk, scheduled, or cross-person.
- The action is not obviously reversible.

## Non-Goals

This policy does not implement support actions, database migrations, scheduled
jobs, cleanup, repair, regeneration, backfill, or data mutation. It is a
governance artifact for future packets.
