# Offers & Bundles Product Architecture

Packet 27 defines the product/access model for selling Journal, Programs, Program Series, Integrative Care, and future bundles without coupling purchase to app runtime enrollment.

The core boundary is:

```text
Offer purchase -> entitlement grant -> app access -> user-started enrollment
```

Do not auto-enroll users from purchase. A purchase grants access permissions; the app runtime remains responsible for letting the user choose when and how to start a guided experience.

## Product Access Model

| Concept | Meaning | System Shape |
|---|---|---|
| Offer | Commercial purchase object: what someone buys or an admin grants | `offers.offer_key`, Stripe price config, public buy links |
| Bundle | An offer that grants more than one entitlement | One `offers` row with multiple active `offer_entitlements` rows |
| Entitlement | Access permission granted to a person | `person_entitlements.entitlement_key` |
| Program | App-delivered guided experience | Program runtime/catalogue records plus `program:<slug>` entitlement gates |
| Program Series | Public/marketing grouping and future bundle structure | Admin-managed series that can group programs for landing pages and bundles |
| Enrollment | User-started runtime journey | `program_enrollments`, created when a user starts a program in the app |

Offers and bundles should stay data-driven. If the buyer should receive multiple access rights, add multiple active `offer_entitlements` rows to the offer instead of adding custom checkout or grant logic.

## Current Offer Mappings

| Offer | Product Meaning | Active Entitlement Mapping |
|---|---|---|
| `journal-monthly` | Monthly Journal access | `journal` |
| `journal-annual` | Annual Journal access plus Baseline access | `journal`, `program:baseline` |
| `integrative-care-3pay` | Integrative Care installment purchase | `care:integrative` |

`journal-annual` grants `journal` and `program:baseline`. Baseline access should make Baseline startable in `/app/programs`; it should not create a `program_enrollment` at purchase time.

`integrative-care-3pay` grants `care:integrative`. It should not create a program enrollment unless a future explicit program mapping and enrollment flow are designed separately.

## Future Offer And Bundle Mappings

These are proposed product shapes, not active launch instructions. Add new entitlement keys to `docs/access/ENTITLEMENT-KEY-REGISTRY.md` and `lib/access/constants.ts` before creating active mappings that use them.

| Proposed Offer | Product Shape | Proposed Entitlements |
|---|---|---|
| Fine Diet Method Bundle | Multi-program method package | `program:baseline`, `program:digestive-foundations`, `program:protein-sufficiency` |
| Baseline standalone | Single program purchase | `program:baseline` |
| Digestive Foundations standalone | Single program purchase | `program:digestive-foundations` |
| Protein Sufficiency standalone | Single program purchase | `program:protein-sufficiency` |
| Integrative Care + Journal bundle | Care purchase plus Journal access | `care:integrative`, `journal` |
| Program Series bundle | Access to every program in a public/admin series | One `program:<slug>` entitlement per included program |
| Annual membership bundle | Annual access package across Journal, selected programs, and member features | `journal`, selected `program:<slug>` keys, and any registered `feature:<slug>` keys |

Program Series should organize the public and admin product story. It should not replace entitlements: checkout still grants concrete entitlement keys so runtime access checks remain explicit and auditable.

## Admin Guidance

### Add A New Offer

1. Create the commercial offer in `/admin/offers` with a stable lowercase `offer_key`.
2. Set the intended billing model and Stripe fields, but do not switch live traffic until live checkout readiness passes.
3. Keep draft, typo, and historical offers inactive unless they are intentionally sellable.
4. Add active entitlement mappings only after the keys are registered.
5. Use buy links only after the offer, Stripe config, webhook, and entitlement mappings have been reviewed.

### Map Offer Entitlements

Use `/admin/offers` -> `Mappings` to add one active row for each access permission the offer should grant.

- A single-product offer usually maps to one entitlement.
- A bundle maps to multiple entitlements.
- `duration_days` should be empty for perpetual access or set to the intended number of days.
- Active mappings must use registered keys. Unknown historical keys should remain inactive unless formally added to the registry.

### Avoid Unknown Entitlement Keys

Registered keys live in:

- `docs/access/ENTITLEMENT-KEY-REGISTRY.md`
- `lib/access/constants.ts`

Before creating a new active key:

1. Add the key to both files.
2. Add or confirm runtime access checks for that key.
3. Run `npm run verify:entitlements`.
4. Only then add the active `offer_entitlements` mapping.

### When To Use `program:{slug}`

Use `program:{slug}` when the purchase should unlock access to a specific app-delivered program, such as `program:baseline`.

Use one entitlement per program in a bundle. For example, a Program Series bundle should grant `program:baseline`, `program:digestive-foundations`, and `program:protein-sufficiency` rather than a single broad series key, unless a future runtime gate explicitly supports series-level access.

### When Not To Create Enrollment From Purchase

Do not create `program_enrollments` from checkout, offer grant, or bundle mapping by default.

Purchase-time access should stop at `person_entitlements`. Program enrollment should happen when the user starts the program inside the app and chooses runtime details such as start date and capacity.

Create enrollment from purchase only if a future packet explicitly designs that behavior, covers user timing/capacity implications, and updates the runtime contract.

## Operational Guardrails

- Do not switch Stripe live traffic from this architecture work.
- Do not mutate live Stripe config from code.
- Do not change Plans logic as part of offers/bundles.
- Do not change public program runtime behavior when adding bundle documentation.
- Keep `journal-monthly` and `journal-annual` shared Price ID cleanup parked as a pre-live Stripe verification item until manually resolved or explicitly accepted.
