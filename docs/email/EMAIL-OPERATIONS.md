# Fine Diet — Email Operations Guide

---

## 1. Purpose

This guide defines how Fine Diet emails are:

* **created**
* **triggered**
* **personalized**
* **sent**
* **managed**

It ensures consistency across:

* product updates
* marketing/nurture campaigns
* assessment emails
* transactional flows

---

## 2. System Architecture (How It Works)

Fine Diet email is built on **three layers**:

### Layer 1 — App (Source of Truth)

Responsible for:

* People (`people`)
* Subscriptions (`subscriptions`)
* Preferences (`email_preferences`)
* Events (`people_events`)
* Payload creation

### Layer 2 — n8n (Orchestration)

Responsible for:

* receiving webhook events
* routing by `event_type` / `kind`
* triggering sequences
* calling Resend

### Layer 3 — Resend (Delivery)

Responsible for:

* sending emails
* managing audiences
* handling unsubscribes (via links you generate)

---

## 3. Email Categories

All emails must fall into one of these:

### 1) Product / Platform Updates

* feature launches
* system updates
* account-related information

**Audience:** `product_updates = true`
**Source:** footer, account activity

---

### 2) Marketing / Fine Print (Nurture)

* nutrition insights
* educational content
* early access offers
* campaigns

**Audience:**

* `nutrition_insights = true`
* `program_offers = true`
* `early_access = true`

**Sources:**

* home Fine Print module
* Fine Print landing page
* checkout / onboarding opt-ins

---

### 3) Waitlist

* program waitlist confirmations
* early program access

**Audience:** waitlist segment (currently "General" audience in Resend)

---

### 4) Assessment Emails

* results
* method emails
* follow-up sequences

**Triggered by:** assessment completion
**System:** webhook + outbox + n8n

---

### 5) Transactional

* login / account emails
* system notifications

**Rule:** never mixed with marketing content

---

## 4. Where Emails Are Built

### Current State

| Layer  | Responsibility       |
| ------ | -------------------- |
| App    | Data + payload       |
| n8n    | Routing + triggering |
| Resend | Template + send      |

### Recommended Practice

* Templates live in **Resend**
* Logic lives in **n8n**
* Data originates in **app**

---

## 5. Trigger Types

### Event-driven (primary)

Triggered from:

* `/api/people/newsletter`
* `/api/assessments/email-capture`
* waitlist endpoints

Examples:

* `newsletter_signup`
* `fine_print_signup`
* `waitlist_join`
* `assessment_result_ready`

---

### Manual / Campaign

* triggered manually via n8n or Resend
* uses segments / audiences

---

## 6. Merge Field Guide

### A. Core Contact Fields (always safe)

| Field            | Description                        |
| ---------------- | ---------------------------------- |
| `first_name`     | Person first name                  |
| `last_name`      | Person last name                   |
| `email`          | Email address                      |
| `status`         | marketing_only / subscribed / etc. |
| `primary_source` | first acquisition source           |
| `last_source`    | most recent source                 |
| `utm_source`     | attribution                        |
| `utm_medium`     | attribution                        |
| `utm_campaign`   | attribution                        |

---

### B. Preference Fields (segmentation + compliance)

| Field                | Description                  |
| -------------------- | ---------------------------- |
| `product_updates`    | opted into product emails    |
| `nutrition_insights` | opted into insights          |
| `program_offers`     | opted into offers            |
| `early_access`       | opted into early releases    |
| `unsubscribe_all_at` | global unsubscribe timestamp |
| `unsubscribe_url`    | signed unsubscribe link      |

---

### C. Assessment Fields (contextual only)

| Field                | Description       |
| -------------------- | ----------------- |
| `submission_id`      | assessment record |
| `assessment_type`    | type of test      |
| `assessment_version` | version           |
| `session_id`         | session           |
| `levelId`            | result level      |
| `resultsVersion`     | results config    |
| `email_type`         | result / method   |

---

## 7. Personalization Rules

* Always fallback safely:

  * `"Hey {{first_name | 'there'}}"`
* Never assume fields exist
* Never expose internal IDs in email body
* Only use assessment fields in assessment emails

---

## 8. Unsubscribe & Compliance

### Required in ALL emails

* unsubscribe link
* company identification
* reason for receiving email

### Implementation

* use `buildUnsubscribeUrl()` from `lib/emailLinks.ts`
* route: `/unsubscribe?t=<token>`

### Behavior

* sets `unsubscribe_all_at`
* disables `email_marketing`
* logs `unsubscribed` event in `people_events`

---

## 9. Sending Rules

### Do NOT:

* send marketing to product-only users
* send without unsubscribe link
* mix transactional and marketing content

### Do:

* segment by preference
* respect unsubscribe immediately
* log every send event (via n8n if applicable)

---

## 10. Sequence Design

### Fine Print (example)

1. Welcome email
2. Education email
3. Insight email
4. Soft offer

### Product Updates

* periodic updates only
* no heavy promotional content

### Waitlist

* confirmation
* reminder
* early access notification

---

## 11. n8n Responsibilities

Each workflow should:

* read `kind` or `event_type`
* route cleanly
* send to correct audience
* optionally trigger sequence

Never:

* hardcode logic that belongs in app
* duplicate preference logic

---

## 12. Resend Responsibilities

* store audiences
* send emails
* apply templates
* handle delivery

Not responsible for:

* business logic
* segmentation logic (beyond audiences)

---

## 13. Deployment Checklist (Before Sending Emails)

* [ ] unsubscribe link included
* [ ] correct audience selected
* [ ] merge fields tested
* [ ] test email sent
* [ ] preferences respected
* [ ] no test emails in audience

---

## 14. Future Enhancements

### Near-term

* preference management page
* topic-level opt-out
* double opt-in

### Mid-term

* unified template library
* campaign analytics dashboard
* sequence builder in n8n

---

## 15. Guiding Principle

> One contact. One system. Clear intent. Full control.

Everything should map back to:

* **who the user is**
* **why they opted in**
* **what they agreed to receive**
