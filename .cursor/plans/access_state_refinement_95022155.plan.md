---
name: access state refinement
overview: Refine access-state resolution so known users without prior access history are not treated as lapsed/data-access-only users, while preserving subscriber/practitioner behavior and updating /upgrade copy.
todos:
  - id: types
    content: Update access-state types with registered_no_access and reason taxonomy
    status: completed
  - id: resolver
    content: Refine resolver with prior-access-aware detection and conservative fallback
    status: completed
  - id: upgrade-copy
    content: Update /upgrade copy for lapsed vs registered-no-access users
    status: completed
  - id: validate
    content: Run lints/typecheck and summarize known residual test typedef issues
    status: completed
isProject: false
---

# Access State Refinement V1

## Scope
- Keep the recent app marketing/start implementation intact except for access-state copy/gating touchpoints.
- Add `registered_no_access` as a distinct state from `data_access_only`.
- Add a machine-readable `reason` to resolved access state for UI/debugging.
- Prefer conservative fallbacks: if prior access history is not proven, resolve known users to `registered_no_access`, not `data_access_only`.

## Files To Change
- [`/Users/rashadtyler/Raire Label Dropbox/Raire Label Company Files/_Projects/_Fine Diet/__Website-App/fine-diet-platform/lib/access/accessStateTypes.ts`](/Users/rashadtyler/Raire%20Label%20Dropbox/Raire%20Label%20Company%20Files/_Projects/_Fine%20Diet/__Website-App/fine-diet-platform/lib/access/accessStateTypes.ts)
  - Add `registered_no_access` to `AppAccessStateName`.
  - Add `AccessStateReason` with packet reasons: `no_person_record`, `known_person_no_offer_history`, `active_trial`, `active_subscription`, `expired_trial`, `lapsed_subscription`, `canceled_subscription`, `past_due_subscription`, `former_practitioner_or_program_user`, `practitioner_supported`.
- [`/Users/rashadtyler/Raire Label Dropbox/Raire Label Company Files/_Projects/_Fine Diet/__Website-App/fine-diet-platform/lib/access/accessState.ts`](/Users/rashadtyler/Raire%20Label%20Dropbox/Raire%20Label%20Company%20Files/_Projects/_Fine%20Diet/__Website-App/fine-diet-platform/lib/access/accessState.ts)
  - Add `reason` to `ResolvedAccessState`.
  - Change the current `personExists -> data_access_only` fallback.
  - Add a narrow prior-access-history helper using existing data:
    - inactive/expired `person_entitlements`
    - `stripe_offer_instances` with ended/canceled/pending history
    - legacy `subscriptions` rows for `journal_access` that are inactive
    - practitioner/program history where existing tables can prove it cheaply
  - If no prior history is found, return `registered_no_access` with `known_person_no_offer_history`.
  - Keep active practitioner and subscriber behavior unchanged.
- [`/Users/rashadtyler/Raire Label Dropbox/Raire Label Company Files/_Projects/_Fine Diet/__Website-App/fine-diet-platform/pages/upgrade.tsx`](/Users/rashadtyler/Raire%20Label%20Dropbox/Raire%20Label%20Company%20Files/_Projects/_Fine%20Diet/__Website-App/fine-diet-platform/pages/upgrade.tsx)
  - Keep auth gating and active-subscriber redirect to `/app`.
  - Use `state`/`reason` to distinguish copy:
    - `data_access_only`: “Your data is safe / unlock your tools again.”
    - `registered_no_access` or `none`: start-trial/subscribe framing.
  - No free-tier language.

## Validation
- Run `ReadLints` on changed files.
- Run `npx tsc --noEmit` and confirm any failures are the known unrelated test typedef issues only.
- Manually validate expected resolver outcomes from code paths:
  - no person -> `none` / `no_person_record`
  - known person with no prior history -> `registered_no_access` / `known_person_no_offer_history`
  - active journal/app access -> `subscriber` / `active_subscription`
  - practitioner entitlement/care access -> `practitioner` / `practitioner_supported`
  - expired/inactive entitlement or canceled/ended Stripe instance -> `data_access_only` with lapsed/expired/canceled reason

## Notes
- Do not add trial-window infrastructure unless current tables already expose reliable trial dates.
- Do not alter public/launch trial defaults.
- Do not introduce new entitlement keys or verifier changes.