# Fine Diet — Campaign Moments + Communications v1

## Purpose

Campaign Moments v1 extends the existing People system so waitlists, launch notices, priority access messages, and future program moments can use email and SMS without creating a parallel CRM.

The core rule remains:

> One person record. One intent/subscription trail. One event history.

## Current v1 scope

This build supports:

- People-native waitlist capture enrichment.
- SMS consent proof capture.
- Communication outbox records for provider-abstracted SMS.
- Mock/log-only SMS delivery by default.
- Twilio adapter and webhook endpoints for later activation.
- Provider feedback events in `communication_events`.
- Person timeline events in `people_events` where applicable.

## Database objects

Migration/script:

- `scripts/sql/createCampaignMomentsCommunicationsV1.sql`

Tables:

- `campaign_moments` — registry for sendable or scheduled campaign moments.
- `communication_outbox` — queued outbound email/SMS messages.
- `communication_events` — provider/internal feedback for communications.
- `sms_consent_events` — proof trail for SMS opt-in/opt-out.

People table additions:

- `sms_opt_out_at`
- `sms_consent_source`
- `sms_consent_text`
- `sms_consent_version`
- `preferred_contact_channel`

## Waitlist capture payload additions

`POST /api/people/waitlist` now accepts:

- `phone`
- `smsOptIn`
- `smsConsentText`
- `smsConsentVersion`
- `captureMode`: `simple`, `priority`, `concierge`
- `preferredChannel`: `email`, `sms`, `either`
- `campaignKey`
- `offerKey`
- `startPageSlug`

Email remains required because the current People system uses email as the unique person spine.

If `smsOptIn=true`, a phone number is required. If `preferredChannel=sms`, a phone number is required.

## SMS provider strategy

SMS is provider-abstracted in:

- `lib/communications/smsProvider.ts`

Default behavior:

```env
SMS_PROVIDER=mock
```

Live Twilio behavior later:

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=...
TWILIO_STATUS_CALLBACK_URL=https://myfinediet.com/api/communications/twilio/status
COMMUNICATIONS_API_KEY=...
```

## Operational endpoints

### Process outbox

`POST /api/communications/process-outbox`

Auth:

```http
Authorization: Bearer <COMMUNICATIONS_API_KEY>
```

Fallback auth key:

```env
EDITORIAL_API_KEY
```

Body:

```json
{ "limit": 10 }
```

Processes due SMS messages only in v1. With `SMS_PROVIDER=mock`, this marks messages as sent with mock provider IDs. With `SMS_PROVIDER=twilio`, it sends through Twilio.

### Twilio status webhook

`POST /api/communications/twilio/status`

Receives Twilio lifecycle events and updates `communication_outbox` / `communication_events`.

Before live activation, add Twilio request signature verification.

### Twilio inbound webhook

`POST /api/communications/twilio/inbound`

Handles inbound SMS and STOP/START-style consent updates. Writes to `people`, `sms_consent_events`, and `communication_events`.

Before live activation, add Twilio request signature verification.

## Twilio activation checklist

Tracked in Second Brain task:

- `Complete Twilio SMS activation for Campaign Moments`

To complete live SMS later:

1. Create/configure Twilio account.
2. Complete US A2P 10DLC registration if sending to US numbers.
3. Create Messaging Service / sender.
4. Add Twilio env vars.
5. Configure public status callback URL.
6. Configure inbound reply/STOP webhook.
7. Add request signature verification to Twilio webhook routes.
8. Test sent, delivered, failed, undelivered, STOP, and START events.
9. Switch `SMS_PROVIDER` from `mock` to `twilio`.

## Next build steps

1. Build the Waitlist Capture Module UI against `/api/people/waitlist`.
2. Add an admin/read view for `communication_outbox`, `communication_events`, and `sms_consent_events`.
3. Add campaign moment creation/editing UI once the first 2–3 real moments are defined.
4. Decide whether `email_campaigns` should be folded into or bridged with `campaign_moments`.
