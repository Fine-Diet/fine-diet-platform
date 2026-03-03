'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { JournalEntry, JournalEntryType } from '@/lib/journal';

interface CompactLoggedCardProps {
  entry: JournalEntry;
  editHref: string;
  onDelete?: (id: string) => void;
}

/**
 * Format a compact summary string for non-intake entry types.
 */
function formatEntrySummary(entry: JournalEntry): string {
  const p = entry.payload as Record<string, unknown>;
  switch (entry.type) {
    case 'water':
      return `${p.amount ?? '?'} ${p.unit ?? 'oz'}`;
    case 'supplement':
      return `${p.name ?? 'Supplement'}${p.dose != null ? ` ${p.dose}${p.unit ? ` ${p.unit}` : ''}` : ''}`;
    case 'mood':
      return `Mood ${p.score ?? '?'}/10${p.note ? ` — ${String(p.note).slice(0, 30)}` : ''}`;
    case 'bowel':
      return `Bristol ${p.bristol ?? '?'}${p.urgency != null ? ` · Urgency ${p.urgency}` : ''}${p.note ? ` — ${String(p.note).slice(0, 25)}` : ''}`;
    case 'cycle':
      return p.phase ? String(p.phase) : p.cycleDay != null ? `Day ${p.cycleDay}` : 'Cycle';
    case 'movement':
      return `${p.type ?? 'Activity'} · ${p.minutes ?? '?'} min${p.intensity != null ? ` (${p.intensity}/3)` : ''}`;
    case 'blood_pressure':
      return `${p.systolic ?? '?'}/${p.diastolic ?? '?'} mmHg${p.pulse != null ? ` · ${p.pulse} bpm` : ''}`;
    case 'sleep': {
      const mins = Number(p.durationMinutes ?? 0);
      return `${Math.floor(mins / 60)}h ${mins % 60}m${p.quality != null ? ` · Quality ${p.quality}/5` : ''}`;
    }
    case 'note':
      return String(p.text ?? '').slice(0, 60) + (String(p.text ?? '').length > 60 ? '…' : '');
    default:
      return 'Entry';
  }
}

/**
 * Get a short label for the entry type.
 */
function getTypeLabel(type: JournalEntryType): string {
  const labels: Record<string, string> = {
    water: 'Water',
    supplement: 'Supplement',
    mood: 'Mood',
    bowel: 'Bowel',
    cycle: 'Cycle',
    movement: 'Movement',
    blood_pressure: 'Blood Pressure',
    sleep: 'Sleep',
    note: 'Note',
    other: 'Entry',
  };
  return labels[type] ?? type;
}

/**
 * Compact card for non-intake journal entries.
 * Shows type label + summary, Edit/Delete menu.
 */
export function CompactLoggedCard({ entry, editHref, onDelete }: CompactLoggedCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  const handleCardClick = () => {
    if (!menuOpen) router.push(editHref);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(entry.id);
    setMenuOpen(false);
  };

  const summary = formatEntrySummary(entry);
  const typeLabel = getTypeLabel(entry.type as JournalEntryType);

  return (
    <div
      className="relative bg-transparent p-4 cursor-pointer hover:bg-white/5 transition-colors"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      aria-label={`Edit ${typeLabel}: ${summary}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-brand-50/60 text-sm font-medium">{typeLabel}</span>
          <p className="text-brand-50 text-lg font-semibold truncate">{summary}</p>
        </div>
        <div className="shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="p-1.5 text-brand-50 hover:text-white transition-colors rounded"
            aria-label="Options"
            aria-expanded={menuOpen}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          className="absolute right-4 top-12 z-50 min-w-[120px] rounded-lg bg-brand-900 border border-white/20 shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={editHref}
            className="block px-4 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className="w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-white/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
