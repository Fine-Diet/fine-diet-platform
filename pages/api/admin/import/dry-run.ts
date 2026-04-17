/**
 * API Route: Import Dry Run
 *
 * POST /api/admin/import/dry-run
 *
 * Accepts parsed import rows, queries the database to determine what would
 * happen for each row, and returns a per-row action plan + summary.
 * Nothing is written to the database.
 *
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  ImportRow,
  ImportOptions,
  DryRunRow,
  DryRunSummary,
  DryRunResponse,
  RowAction,
} from '@/lib/admin/importTypes';
import { DEFAULT_IMPORT_OPTIONS } from '@/lib/admin/importTypes';

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

// ---------------------------------------------------------------------------
// Determine whether a person is unsubscribed in Fine Diet's system
// ---------------------------------------------------------------------------

interface PersonRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

interface SubRecord {
  person_id: string;
  is_active: boolean;
}

interface PrefRecord {
  person_id: string;
  unsubscribe_all_at: string | null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DryRunResponse | { error: string }>,
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { rows, options: rawOptions } = req.body as {
    rows: ImportRow[];
    options?: Partial<ImportOptions>;
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required.' });
  }

  const options: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, ...rawOptions };

  // ---------------------------------------------------------------------------
  // Deduplicate within the file itself
  // ---------------------------------------------------------------------------

  const seenEmails = new Map<string, number>(); // email → first sourceRowIndex

  const normalizedRows = rows.map((row) => ({
    ...row,
    email: normalizeEmail(row.email || ''),
  }));

  // ---------------------------------------------------------------------------
  // Batch-fetch all existing people by email
  // ---------------------------------------------------------------------------

  const validEmails = normalizedRows
    .filter((r) => isValidEmail(r.email))
    .map((r) => r.email);

  const uniqueEmails = Array.from(new Set(validEmails));

  const { data: existingPeople } = await supabaseAdmin
    .from('people')
    .select('id, email, first_name, last_name, status')
    .in('email', uniqueEmails);

  const peopleByEmail = new Map<string, PersonRecord>(
    (existingPeople || []).map((p) => [p.email, p as PersonRecord]),
  );

  // ---------------------------------------------------------------------------
  // Batch-fetch unsubscribed status for all existing people
  // ---------------------------------------------------------------------------

  const existingPersonIds = (existingPeople || []).map((p) => p.id);

  let unsubscribedIds = new Set<string>();
  let inactiveSubIds = new Set<string>();

  if (existingPersonIds.length > 0) {
    // Check email_preferences for global unsubscribe
    const { data: prefs } = await supabaseAdmin
      .from('email_preferences')
      .select('person_id, unsubscribe_all_at')
      .in('person_id', existingPersonIds)
      .not('unsubscribe_all_at', 'is', null);

    unsubscribedIds = new Set((prefs || []).map((p: PrefRecord) => p.person_id));

    // Check subscriptions for inactive email_marketing
    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('person_id, is_active')
      .in('person_id', existingPersonIds)
      .eq('subscription_type', 'email_marketing')
      .eq('is_active', false);

    inactiveSubIds = new Set((subs || []).map((s: SubRecord) => s.person_id));
  }

  // ---------------------------------------------------------------------------
  // Evaluate each row
  // ---------------------------------------------------------------------------

  const resultRows: DryRunRow[] = [];

  const summary: DryRunSummary = {
    total: normalizedRows.length,
    toCreate: 0,
    toUpdate: 0,
    skipUnsubscribed: 0,
    skipNoConsent: 0,
    skipDuplicate: 0,
    invalid: 0,
  };

  for (const row of normalizedRows) {
    const { email, first_name, last_name, subscribed, tags, sourceRowIndex } = row;

    // ── Invalid: missing or malformed email ──────────────────────────────────
    if (!email || !isValidEmail(email)) {
      resultRows.push({
        sourceRowIndex,
        email,
        first_name,
        last_name,
        subscribed,
        tags,
        action: 'invalid',
        reason: !email ? 'Missing email address.' : `Invalid email format: "${email}"`,
      });
      summary.invalid++;
      continue;
    }

    // ── Duplicate within this import file ────────────────────────────────────
    if (seenEmails.has(email)) {
      resultRows.push({
        sourceRowIndex,
        email,
        first_name,
        last_name,
        subscribed,
        tags,
        action: 'skip_duplicate',
        reason: `Duplicate email — first appeared at row ${seenEmails.get(email)}.`,
      });
      summary.skipDuplicate++;
      continue;
    }
    seenEmails.set(email, sourceRowIndex);

    // ── Skip: explicit no-consent in source ──────────────────────────────────
    if (subscribed === false) {
      resultRows.push({
        sourceRowIndex,
        email,
        first_name,
        last_name,
        subscribed,
        tags,
        action: 'skip_no_consent',
        reason: 'Source record is unsubscribed. Will not import.',
      });
      summary.skipNoConsent++;
      continue;
    }

    const existing = peopleByEmail.get(email);

    if (existing) {
      // ── Skip: already unsubscribed in our system ──────────────────────────
      if (
        unsubscribedIds.has(existing.id) ||
        (inactiveSubIds.has(existing.id) && existing.status === 'unsubscribed')
      ) {
        resultRows.push({
          sourceRowIndex,
          email,
          first_name,
          last_name,
          subscribed,
          tags,
          action: 'skip_unsubscribed',
          reason: 'Contact already exists and is unsubscribed in Fine Diet. Will not re-subscribe.',
          existingPerson: existing,
        });
        summary.skipUnsubscribed++;
        continue;
      }

      // ── Update: existing, subscribed, name fields may fill in ────────────
      resultRows.push({
        sourceRowIndex,
        email,
        first_name,
        last_name,
        subscribed,
        tags,
        action: 'update',
        reason: `Existing contact. ${
          !existing.first_name && first_name
            ? 'First name will be filled in. '
            : ''
        }${
          !existing.last_name && last_name
            ? 'Last name will be filled in. '
            : ''
        }Subscription/preferences will be ensured active.`,
        existingPerson: existing,
      });
      summary.toUpdate++;
    } else {
      // ── Create: new person ────────────────────────────────────────────────
      const willSubscribe =
        subscribed === true ||
        (subscribed === null && options.unknownConsentBehavior === 'subscribe');

      resultRows.push({
        sourceRowIndex,
        email,
        first_name,
        last_name,
        subscribed,
        tags,
        action: 'create',
        reason: `New contact. ${
          willSubscribe
            ? 'Will create with active email_marketing subscription.'
            : 'Will create without subscription (unknown consent, skip mode).'
        }`,
      });
      summary.toCreate++;
    }
  }

  return res.status(200).json({ summary, rows: resultRows });
}
