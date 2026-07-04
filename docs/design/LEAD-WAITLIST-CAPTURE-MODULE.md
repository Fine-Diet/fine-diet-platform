# Lead Waitlist Capture Module (`lead.waitlist-capture.v1`)

A conversion-safe lead / waitlist capture form. It is available across `/start`,
`/programs`, and `/integrative-care` through the shared module registry pattern,
mirroring `access.code-gate.v1`.

## Hard boundaries

This module owns ONLY lead capture + SMS consent UX. It must NOT:

- change billing, checkout, Stripe, price-option, trial, entitlement, or offer truth
- grant entitlements or trial access
- activate or modify checkout flows
- trigger outbox processing or send real SMS from the browser
- expose backend internals in error states

Submission posts to `POST /api/people/waitlist` with pass-through context
(`programSlug` / `offerKey` / `startPageSlug` / `source` / `redirect_path` /
UTM). The browser never triggers outbox processing — SMS stays mock-only unless
the backend environment is explicitly activated.

`variant` maps 1:1 to the backend `captureMode`:

- `simple` — email + optional phone
- `priority` — phone required
- `concierge` — phone + intent goal

## Module registration path

- Type key: `lead.waitlist-capture.v1`
- Component: `components/modules/LeadWaitlistCaptureV1.tsx` (registered in `lib/modules/registry.ts`)
- Zod schema: `leadWaitlistCaptureV1Schema` in `lib/modules/schema.ts`
- TypeScript content interface: `LeadWaitlistCaptureV1Content` in `lib/modules/types.ts`
- Field descriptors: `lib/modules/fieldDescriptors.ts`
- Starter content: `createLeadWaitlistCaptureStarterContent` in `lib/startPages/startRuntimeModules.ts`
- Start-safe allowlist: `START_RUNTIME_MODULE_TYPE_KEYS`

## Content contract

```ts
{
  variant: "simple" | "priority" | "concierge",
  eyebrow: "Waitlist",
  title: "Join the app waitlist",
  description: "Join the Fine Diet waitlist for launch updates, early access invitations, and first notice when the app opens to new users.",
  phonePrompt: "Add your phone number for priority updates.",
  nameLabel: "Name",
  firstNameLabel: "First Name",   // banded layout only
  lastNameLabel: "Last Name",     // banded layout only
  emailLabel: "Email",
  phoneLabel: "Phone",
  smsConsentLabel: "I agree to receive SMS updates …",
  smsConsentVersion: "waitlist-sms-v1",
  ctaLabel: "Join The Waitlist",
  submittingLabel: "Saving your spot…",
  successTitle: "You're on the list.",
  successBody: "We'll contact you when this opens.",
  successSmsNote: "If you added your phone number, we may text you …",
  errorFallback: "Something went wrong. Please try again.",
  campaignKey: "waitlist_capture_v1",
  preferredChannel: "either",
  source: "start_waitlist",
  programSlug: null,
  offerKey: null,
  startPageSlug: null,
  redirectPath: null,
  // Banded presentation (all optional):
  layout: "banded",
  backgroundTone: "blue",
  railEnabled: true,
  railText: "JOIN THE WAITLIST",
  anchorId: "waitlist"
}
```

`nameLabel` is preserved for the standard (legacy) layout. In the banded layout
the single `name` field is presented as two line inputs (First / Last) using
`firstNameLabel` / `lastNameLabel`. The backend payload stays a single combined
`name` string — `[firstName, lastName].filter(Boolean).join(' ')` — so the
payload contract is unchanged.

## Visual presentation (banded layout)

The module supports an optional prototype `banded` presentation via the shared
`ConversionBandShell` (`components/modules/shared/ConversionBandShell.tsx`).
The banded style is opt-in and fully backward compatible — existing authored
modules without the new fields render unchanged in the legacy single-column
style.

Banded fields (all optional; group: "Banded layout" in the module builder):

- `layout` — `'banded'` opts into the prototype band. Omitted / `'standard'` =
  legacy style. **New modules default to `'banded'`** via starter content.
- `backgroundTone` — `'blue'` = pale denim band (prototype). `'cream'` /
  `'default'` = legacy brand-50 cream. New modules default to `'blue'`.
- `railEnabled` — show the top repeating label rail. Defaults to on in the
  banded layout.
- `railText` — top rail label. Defaults to `JOIN THE WAITLIST` when blank.
- `anchorId` — rendered as `<section id="…">` so page CTAs / nav can scroll to
  the band. Sanitized to a safe HTML id slug. Recommended marketing values:
  `waitlist`, `join-waitlist`. Link with `#waitlist`, etc.
- `firstNameLabel` / `lastNameLabel` — split-name line-input labels used only
  in the banded layout. The backend still receives one combined `name`.

Banded rendering (matches the supplied prototype screenshot):

- Full-width pale blue (`bg-denim-900`) section framed by a thin top border
  (`border-t border-brand-900/10`) and a thick bottom break line
  (`border-b-8 border-brand-900`) that closes the module before the next page
  section.
- Top horizontal repeating rail: `JOIN THE WAITLIST` (the rail also has its own
  thin bottom border separating it from the content).
- Centered content (`max-w-2xl`): eyebrow, centered title, centered description.
- Two-column line-input layout on desktop (one column on mobile):
  - First Name / Last Name
  - Email \* / Phone
  - Underline-style, transparent inputs.
  - **No visible field headers/labels above the inputs.** The field labels
    (`First Name`, `Last Name`, `Email *`, `Phone`) are shown as left-aligned
    placeholder text sitting directly on the underline, at base text size.
    A screen-reader label is still provided via `aria-label`; the required
    marker for email (and required phone) is rendered in the placeholder
    (`Email *`).
- `phonePrompt` is not rendered in the banded layout (it stays available in the
  standard layout).
- SMS consent checkbox and copy preserved.
- Wide dark rounded pill CTA (`rounded-full bg-brand-900`).
- Success state reuses the same banded shell (not a card style).

### Backend endpoint

`POST /api/people/waitlist` — payload, context, and SMS consent handling are
unchanged by the visual update. The banded layout only changes how the single
`name` value is collected (split inputs → combined string).

### Anchor / CTA behavior

When `anchorId` is set, the section renders with that id. Any page CTA or nav
link (e.g. `#waitlist`) scrolls to the module. The module itself does not care
whether the visitor arrived from pricing, product selection, or a direct anchor
— no checkout logic is added. If `anchorId` is omitted, no id is rendered
(preserving the legacy no-anchor behavior).

On Start pages, the hero / final-CTA buttons can be redirected to this section
via `config.hero.primaryCta` / `config.finalCta.primaryCta` (`{ label, href }`)
in the Start Page admin editor — e.g. `href: #waitlist`. See
`docs/design/START-PAGE-MODULE-BUILDER.md`. The CTA override is presentation
only; it does not change the waitlist payload or SMS consent behavior.

## Notes for marketing

- Use `layout: "banded"` + `backgroundTone: "blue"` for the prototype style.
- Set `anchorId` (e.g. `waitlist`) whenever a CTA should scroll to the module.
- Waitlist rail default is `JOIN THE WAITLIST`.
- The waitlist module is lead capture only — it never grants entitlements,
  triggers checkout, or sends real SMS from the browser.
