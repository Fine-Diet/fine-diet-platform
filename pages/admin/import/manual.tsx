/**
 * Admin Page: Manual Add Contact
 *
 * Operator tool for adding a single contact with full preference control.
 * Use cases:
 *   - Seeding test contacts before running bulk import
 *   - Adding contacts manually from a conversation or referral
 *   - Testing the editorial send path with one known contact
 *
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { ManualContactInput, ManualContactResult } from '@/pages/api/admin/import/manual';

interface PageProps {
  user: AuthenticatedUser | null;
}

const SOURCE_OPTIONS = [
  { value: 'manual_admin', label: 'Admin / manual entry' },
  { value: 'klaviyo_import', label: 'Klaviyo (migration)' },
  { value: 'existing_customer', label: 'Existing customer' },
  { value: 'referral', label: 'Referral' },
  { value: 'fine_print_signup', label: 'Fine Print signup' },
  { value: 'newsletter_signup', label: 'Newsletter signup' },
  { value: 'test', label: 'Test / QA' },
];

interface CheckboxFieldProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  warning?: boolean;
}

function CheckboxField({ id, label, hint, checked, onChange, warning }: CheckboxFieldProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer py-2">
      <div className="mt-0.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={`w-4 h-4 border-gray-300 rounded ${warning ? 'text-orange-500 focus:ring-orange-400' : 'text-blue-600 focus:ring-blue-500'}`}
        />
      </div>
      <div>
        <span className={`text-sm font-medium ${warning ? 'text-orange-700' : 'text-gray-700'}`}>{label}</span>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}

export default function ManualAddContactPage({ user }: PageProps) {
  const defaultForm: ManualContactInput = {
    email: '',
    first_name: '',
    last_name: '',
    source: 'manual_admin',
    emailMarketing: true,
    nutritionInsights: true,
    productUpdates: false,
    programOffers: false,
    earlyAccess: false,
    markAsEditorialEligible: false,
    triggerNurtureNow: false,
  };

  const [form, setForm] = useState<ManualContactInput>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ManualContactResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">You don't have permission to access this area.</p>
      </main>
    );
  }

  const set = <K extends keyof ManualContactInput>(key: K, value: ManualContactInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/import/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed.');
      setResult(data);
      if (data.wasNew) {
        // Reset form for next add
        setForm((f) => ({ ...defaultForm, source: f.source }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <>
      <Head>
        <title>Add Single Contact • Fine Diet Admin</title>
      </Head>

      <div className="min-h-screen bg-gray-100 pt-[100px] pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          <Link href="/admin/import" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">
            ← Import Hub
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Add Single Contact</h1>
          <p className="text-gray-500 text-sm mb-8">
            Manually add or update one contact. Safe to re-run: existing contacts are updated
            without overwriting stronger existing preferences.
          </p>

          {/* Result banner */}
          {result && (
            <div className={`rounded-lg border p-4 mb-6 ${result.wasNew ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`text-sm font-semibold mb-1 ${result.wasNew ? 'text-green-800' : 'text-blue-800'}`}>
                {result.wasNew ? 'Contact created' : 'Existing contact updated'}
              </p>
              <p className={`text-sm ${result.wasNew ? 'text-green-700' : 'text-blue-700'}`}>
                {result.message}
              </p>
              {result.nurtureTriggered && (
                <p className="text-xs text-purple-700 bg-purple-50 rounded px-2 py-1 mt-2 border border-purple-200">
                  Nurture sequence live — Welcome Email 1 dispatched via n8n. Check inbox within 1–2 minutes.
                </p>
              )}
              <p className="text-xs text-gray-400 mt-2 font-mono">ID: {result.personId}</p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => setResult(null)}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded px-3 py-1"
                >
                  Add another
                </button>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Identity */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Identity</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="contact@example.com"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={form.first_name || ''}
                    onChange={(e) => set('first_name', e.target.value)}
                    placeholder="Rashad"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={form.last_name || ''}
                    onChange={(e) => set('last_name', e.target.value)}
                    placeholder="Tyler"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={form.source || 'manual_admin'}
                  onChange={(e) => set('source', e.target.value)}
                  className={inputClass}
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Subscriptions */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Subscriptions</h2>
              <p className="text-xs text-gray-400 mb-4">
                Preferences are only enabled — never disabled. Existing active preferences are preserved.
                Unsubscribed contacts will not have their subscription reactivated.
              </p>
              <div className="divide-y divide-gray-100">
                <CheckboxField
                  id="emailMarketing"
                  label="Email Marketing"
                  hint="Creates an active email_marketing subscription if one doesn't exist."
                  checked={form.emailMarketing}
                  onChange={(v) => set('emailMarketing', v)}
                />
                <CheckboxField
                  id="nutritionInsights"
                  label="Nutrition Insights (Fine Print)"
                  hint="Sets nutrition_insights = true in email_preferences. Required for editorial eligibility."
                  checked={form.nutritionInsights}
                  onChange={(v) => set('nutritionInsights', v)}
                />
                <CheckboxField
                  id="productUpdates"
                  label="Product Updates"
                  hint="Sets product_updates = true in email_preferences."
                  checked={form.productUpdates}
                  onChange={(v) => set('productUpdates', v)}
                />
                <CheckboxField
                  id="programOffers"
                  label="Program Offers"
                  hint="Sets program_offers = true in email_preferences."
                  checked={form.programOffers}
                  onChange={(v) => set('programOffers', v)}
                />
                <CheckboxField
                  id="earlyAccess"
                  label="Early Access"
                  hint="Sets early_access = true in email_preferences."
                  checked={form.earlyAccess}
                  onChange={(v) => set('earlyAccess', v)}
                />
              </div>
            </div>

            {/* Nurture sequence */}
            <div className="bg-white rounded-lg border border-purple-200 p-6">
              <h2 className="text-sm font-semibold text-purple-700 uppercase tracking-wide mb-1">Fine Print Nurture</h2>
              <p className="text-xs text-gray-500 mb-4">
                Triggers the live 3-email nurture sequence immediately, identical to a real Fine Print
                signup. Welcome Email 1 arrives within ~1 minute. Email 2 and Email 3 follow at 2-day
                intervals. Use this to test the full send stack end-to-end.
              </p>
              <CheckboxField
                id="triggerNurtureNow"
                label="Trigger Fine Print nurture now"
                hint="Emits a fine_print_signup webhook to n8n. Welcome Email 1 will be sent using the live Resend stack. Cannot be combined with editorial eligibility."
                checked={form.triggerNurtureNow}
                onChange={(v) => {
                  set('triggerNurtureNow', v);
                  if (v) set('markAsEditorialEligible', false);
                }}
              />
              {form.triggerNurtureNow && (
                <p className="mt-2 text-xs text-purple-700 bg-purple-50 rounded p-2 border border-purple-100">
                  If this contact is globally unsubscribed, the nurture webhook will be sent but n8n will not dispatch emails.
                </p>
              )}
            </div>

            {/* Editorial eligibility */}
            <div className="bg-white rounded-lg border border-orange-200 p-6">
              <h2 className="text-sm font-semibold text-orange-700 uppercase tracking-wide mb-1">Editorial Eligibility</h2>
              <p className="text-xs text-gray-500 mb-4">
                Bypasses the nurture sequence entirely. Only check this if the contact is already warm
                and should immediately receive weekly Fine Print editorial sends.
              </p>
              <CheckboxField
                id="markAsEditorialEligible"
                label="Mark as editorial-eligible now"
                hint="Logs fine_print_sequence_completed so this contact appears in the weekly send audience. Requires Email Marketing + Nutrition Insights to be checked. Cannot be combined with Trigger Nurture."
                checked={form.markAsEditorialEligible}
                onChange={(v) => {
                  set('markAsEditorialEligible', v);
                  if (v) set('triggerNurtureNow', false);
                }}
                warning
              />
              {form.markAsEditorialEligible && !form.emailMarketing && (
                <p className="mt-2 text-xs text-orange-600 bg-orange-50 rounded p-2">
                  ⚠ Email Marketing must also be enabled for editorial eligibility to take effect.
                </p>
              )}
              {form.markAsEditorialEligible && !form.nutritionInsights && (
                <p className="mt-2 text-xs text-orange-600 bg-orange-50 rounded p-2">
                  ⚠ Nutrition Insights must also be enabled for editorial eligibility to take effect.
                </p>
              )}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between pt-2">
              <Link href="/admin/import" className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add Contact'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }
  return { props: { user } };
};
