'use client';

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import {
  journalService,
  formatTime,
  setTimeOnDate,
  type JournalEntry,
} from '@/lib/journal';

const UNITS = ['serving', 'cup', 'g', 'oz', 'ml', 'piece'];

export default function JournalEntryPage() {
  const router = useRouter();
  const rawId = router.query?.id;
  const id = typeof rawId === 'string' ? rawId : undefined;
  const rawRedirect = router.query?.redirect;
  const redirectTarget = getSafeRedirectTarget(
    typeof rawRedirect === 'string' ? rawRedirect : null,
    '/journal'
  );

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    const e = journalService.getEntry(id);
    if (!e) {
      setNotFound(true);
      return;
    }
    setEntry(e);
    setQuantity(String(e.payload.quantity ?? 1));
    setUnit(e.payload.unit ?? 'serving');
    setTimeStr(formatTime(e.timestamp));
  }, [id]);

  const applyUpdates = (updates: Partial<{ quantity: string; unit: string; timeStr: string }>) => {
    if (!entry) return;
    const q = updates.quantity ?? quantity;
    const u = updates.unit ?? unit;
    const t = updates.timeStr ?? timeStr;
    const qNum = parseFloat(q);
    const newTimestamp = setTimeOnDate(new Date(entry.timestamp), t);
    journalService.updateEntry(entry.id, {
      payload: {
        ...entry.payload,
        quantity: isNaN(qNum) ? undefined : qNum,
        unit: u || undefined,
      },
      timestamp: newTimestamp,
    });
    const updated = journalService.getEntry(entry.id);
    if (updated) setEntry(updated);
    setQuantity(String(updated?.payload.quantity ?? 1));
    setUnit(updated?.payload.unit ?? 'serving');
    setTimeStr(formatTime(updated?.timestamp ?? new Date()));
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1500);
  };

  const handleQuantityBlur = () => {
    if (!entry) return;
    applyUpdates({ quantity, unit, timeStr });
  };

  const handleUnitChange = (u: string) => {
    setUnit(u);
    if (entry) applyUpdates({ quantity, unit: u, timeStr });
  };

  const handleTimeChange = (t: string) => {
    setTimeStr(t);
    if (entry) applyUpdates({ quantity, unit, timeStr: t });
  };

  const handleDelete = () => {
    if (!entry) return;
    journalService.deleteEntry(entry.id);
    window.location.href = redirectTarget;
  };

  if (notFound || (!entry && id)) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col items-center justify-center px-6">
        <p className="text-white/80 mb-4">Entry not found.</p>
        <Link href={redirectTarget} className="text-dark_accent-300 hover:underline">
          Go back
        </Link>
      </div>
    );
  }

  if (!entry) return null;

  return (
    <div className="min-h-screen bg-brand-900 text-white max-w-[1200px] mx-auto relative flex flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-4 px-4 py-4 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <Link
          href={redirectTarget}
          className="p-2 -ml-2 text-white/80 hover:text-white transition-colors"
          aria-label="Back"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-medium text-white truncate">
          {entry.payload.name ?? 'Edit item'}
        </h1>
        {savedFeedback && (
          <span className="ml-auto text-sm text-dark_accent-300">Saved</span>
        )}
      </header>

      <main className="flex-1 px-4 py-6 space-y-6">
        <div>
          <label className="block text-white/70 text-sm font-medium mb-1">Quantity</label>
          <input
            type="number"
            min={0}
            step={0.25}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={handleQuantityBlur}
            className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          />
        </div>

        <div>
          <label className="block text-white/70 text-sm font-medium mb-1">Unit</label>
          <select
            value={unit}
            onChange={(e) => handleUnitChange(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {UNITS.map((u) => (
              <option key={u} value={u} className="bg-brand-800 text-white">
                {u}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-white/70 text-sm font-medium mb-1">Time</label>
          <input
            type="time"
            value={timeStr}
            onChange={(e) => handleTimeChange(e.target.value)}
            onBlur={() => applyUpdates({ quantity, unit, timeStr })}
            className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <p className="text-white/50 text-xs mt-1">
            Moving time may change which block (Morning / Midday / Evening) this appears in.
          </p>
        </div>

        <div className="pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg border border-semantic-error/60 text-semantic-error text-sm font-medium hover:bg-semantic-error/10 transition-colors"
          >
            Delete
          </button>
        </div>
      </main>
    </div>
  );
}
