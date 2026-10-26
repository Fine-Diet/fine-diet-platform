'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  BloodPressureForm,
  BowelForm,
  CycleForm,
  MoodForm,
  MovementForm,
  SleepForm,
  SupplementForm,
  TAB_TO_ENTRY_TYPE,
  WaterForm,
} from '@/components/journal/LogEntryForms';
import {
  journalService,
  deriveBlock,
  type JournalEntryPayload,
} from '@/lib/journal';
import { getEffectiveEnabledLogTrackingKeys, getLogTrackingDestination } from '@/lib/navigation/logTrackingDestinations';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { onAuthStateChange } from '@/lib/authHelpers';
import { resolveLogCaptureRouteContext, validateLogCaptureDateTime } from '@/lib/journal/logCaptureDateTime';

type CaptureTab = 'water' | 'sleep' | 'supplements' | 'mood' | 'bowel' | 'cycle' | 'movement' | 'blood_pressure';
type FormProps = Parameters<typeof WaterForm>[0];

export const LOG_CAPTURE_FORMS: Record<CaptureTab, React.ComponentType<FormProps>> = {
  water: WaterForm,
  sleep: SleepForm,
  supplements: SupplementForm,
  mood: MoodForm,
  bowel: BowelForm,
  cycle: CycleForm,
  movement: MovementForm,
  blood_pressure: BloodPressureForm,
};

function TrackingUnavailable({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 text-brand-50">
      <p className="text-xs uppercase tracking-[0.16em] text-brand-50/45">Log</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-brand-50/65">{body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={APP_ROUTES.log} className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium hover:bg-white/10">Return to Log</Link>
        <Link href={`${APP_ROUTES.profile}?section=tracking#tracking-prefs`} className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/85">Tracking Preferences</Link>
      </div>
    </main>
  );
}

export function LogEntryCapturePage({ tab }: { tab: string }) {
  const router = useRouter();
  const destination = getLogTrackingDestination(tab);
  const supported = destination?.captureSupported === true && destination.tab === tab;
  const routeContextKey = JSON.stringify([
    tab,
    router.query.date,
    router.query.time,
    router.query.block,
  ]);
  const initialRouteContext = resolveLogCaptureRouteContext(router.query as Record<string, unknown>);
  const [settingsState, setSettingsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [settingsRefreshError, setSettingsRefreshError] = useState(false);
  const [checkingSettings, setCheckingSettings] = useState(false);
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [dateValue, setDateValue] = useState(initialRouteContext.dateValue);
  const [timeValue, setTimeValue] = useState(initialRouteContext.timeValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(initialRouteContext.error);
  const [success, setSuccess] = useState(false);
  const settingsRequestId = useRef(0);
  const settingsRefreshing = useRef(false);
  const hasVerifiedSettings = useRef(false);
  const accountId = useRef<string | null | undefined>(undefined);
  const saveRequestId = useRef(0);
  const successTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const context = resolveLogCaptureRouteContext(router.query as Record<string, unknown>);
    saveRequestId.current += 1;
    setDateValue(context.dateValue);
    setTimeValue(context.timeValue);
    setError(context.error);
    setSuccess(false);
    setSaving(false);
    return () => {
      saveRequestId.current += 1;
      if (successTimer.current !== null) {
        window.clearTimeout(successTimer.current);
        successTimer.current = null;
      }
    };
    // routeContextKey serializes every query value consumed above without depending on the router's new object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, routeContextKey]);

  const refreshSettings = useCallback(async () => {
    const requestId = ++settingsRequestId.current;
    settingsRefreshing.current = true;
    setCheckingSettings(true);
    try {
      const response = await fetch('/api/journal/tracking-settings');
      if (!response.ok) throw new Error(`Tracking settings request failed: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.enabled_tracking_keys)) throw new Error('Invalid tracking settings response');
      if (requestId !== settingsRequestId.current) return;
      hasVerifiedSettings.current = true;
      setEnabledKeys(data.enabled_tracking_keys.filter((key: unknown): key is string => typeof key === 'string'));
      setSettingsRefreshError(false);
      setError((current) => current === 'Tracking preferences are being checked. Please try saving again.' ? null : current);
      setSettingsState('ready');
    } catch {
      if (requestId === settingsRequestId.current) {
        if (hasVerifiedSettings.current) {
          // Keep the same-account form mounted, but block submits until a new
          // successful authorization check confirms the tracker is enabled.
          setSettingsRefreshError(true);
        } else {
          setSettingsState('error');
        }
      }
    } finally {
      if (requestId === settingsRequestId.current) {
        settingsRefreshing.current = false;
        setCheckingSettings(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
    const handleFocus = () => void refreshSettings();
    window.addEventListener('focus', handleFocus);
    let unsubscribeAuth = () => {};
    try {
      unsubscribeAuth = onAuthStateChange((_event, session) => {
        const nextAccountId = session?.user?.id ?? null;
        // The initial auth callback also establishes the account identity for
        // this mounted form; fail closed if a draft predates that confirmation.
        const accountChanged = accountId.current !== nextAccountId;
        accountId.current = nextAccountId;
        if (!session || accountChanged) {
          // Authentication boundaries invalidate the prior account's draft immediately.
          settingsRequestId.current += 1;
          settingsRefreshing.current = true;
          hasVerifiedSettings.current = false;
          setSettingsRefreshError(false);
          setSettingsState('loading');
          setEnabledKeys([]);
        }
        if (session) void refreshSettings();
      });
    } catch {
      // The authenticated API remains the source of truth if auth events are unavailable.
    }
    return () => {
      settingsRequestId.current += 1;
      window.removeEventListener('focus', handleFocus);
      unsubscribeAuth();
    };
  }, [refreshSettings, tab]);

  const enabled = useMemo(() => getEffectiveEnabledLogTrackingKeys(enabledKeys), [enabledKeys]);
  const Form = supported ? LOG_CAPTURE_FORMS[tab as CaptureTab] : null;

  const saveEntry = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!supported || !destination || !destination.captureSupported) return false;
    if (settingsState !== 'ready' || settingsRefreshError || !enabled.includes(destination.key) || settingsRefreshing.current) {
      setError('Tracking preferences are being checked. Please try saving again.');
      return false;
    }
    const validated = validateLogCaptureDateTime(dateValue, timeValue);
    if (!validated.value) {
      setError(validated.error);
      setSuccess(false);
      return false;
    }
    if (saving) return false;
    const requestId = ++saveRequestId.current;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const entryType = TAB_TO_ENTRY_TYPE[tab];
      if (!entryType || entryType === 'intake') throw new Error('This tracker does not support this capture route.');
      await journalService.createEntry({
        type: entryType,
        date: validated.value.date,
        time: timeValue,
        block: deriveBlock(validated.value.occurredAt),
        occurredAt: validated.value.occurredAt,
        payload: payload as JournalEntryPayload,
      });
      if (requestId === saveRequestId.current) {
        setSuccess(true);
        if (successTimer.current !== null) window.clearTimeout(successTimer.current);
        successTimer.current = window.setTimeout(() => {
          if (requestId === saveRequestId.current) setSuccess(false);
          successTimer.current = null;
        }, 2500);
      }
      return true;
    } catch (cause) {
      if (requestId === saveRequestId.current) {
        setError(cause instanceof Error ? cause.message : 'Could not save this entry. Please try again.');
      }
      return false;
    } finally {
      if (requestId === saveRequestId.current) setSaving(false);
    }
  }, [dateValue, destination, enabled, settingsRefreshError, settingsState, supported, tab, timeValue, saving]);

  if (!supported || !destination || !Form) {
    const reserved = destination && !destination.captureSupported;
    return (
      <TrackingUnavailable
        title={reserved ? `${destination.label} capture is coming soon` : 'This Log capture is unavailable'}
        body={reserved
          ? `${destination.label} can remain enabled in Tracking Preferences, but a journal entry form is not available yet.`
          : 'This Log destination is not supported. Choose an enabled tracker from Tracking Preferences.'}
      />
    );
  }

  if (settingsState === 'loading') {
    return <main className="mx-auto w-full max-w-2xl px-5 py-12 text-brand-50" aria-live="polite">Loading tracking preferences…</main>;
  }
  if (settingsState === 'error') {
    return <TrackingUnavailable title="Tracking preferences are unavailable" body="We could not confirm this tracker is enabled. Try again from Log or review Tracking Preferences." />;
  }
  if (!enabled.includes(destination.key)) {
    return <TrackingUnavailable title={`${destination.label} is turned off`} body="This tracker is not enabled for your account. Update Tracking Preferences to use it." />;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-brand-50">
      <Link href={APP_ROUTES.log} className="text-sm text-brand-50/60 hover:text-white">← Return to Log</Link>
      <div className="mt-7">
        <p className="text-xs uppercase tracking-[0.16em] text-brand-50/45">Log capture</p>
        <h1 className="mt-2 text-3xl font-semibold">{destination.label}</h1>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <label className="text-sm text-brand-50/70">Date
          <input type="date" value={dateValue} onChange={(event) => { setDateValue(event.target.value); setError(null); setSuccess(false); }} className="mt-1 block w-full rounded-lg bg-brand-700 px-3 py-2.5 text-white" />
        </label>
        <label className="text-sm text-brand-50/70">Time
          <input type="time" value={timeValue} onChange={(event) => { setTimeValue(event.target.value); setError(null); setSuccess(false); }} className="mt-1 block w-full rounded-lg bg-brand-700 px-3 py-2.5 text-white" />
        </label>
      </div>
      {settingsRefreshError && (
        <div role="alert" className="mt-4 rounded-lg border border-red-300/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
          Tracking permission could not be revalidated. Your draft stays on this page; saving is paused until preferences are checked again.
          <button type="button" onClick={() => void refreshSettings()} disabled={settingsRefreshing.current} className="ml-2 underline disabled:opacity-50">
            Retry
          </button>
        </div>
      )}
      <section className="mt-6 rounded-2xl border border-white/10 bg-neutral-900 p-5">
        <Form onSubmit={saveEntry} isSubmitting={saving || checkingSettings || settingsRefreshError} />
      </section>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{destination.label} entry saved.</p>}
    </main>
  );
}
