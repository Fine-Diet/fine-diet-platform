'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface LoggedItemCardProps {
  id: string;
  name: string;
  serving?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  editHref: string;
  onDelete?: (id: string) => void;
}

/**
 * Card for a logged food item. Clicking the card goes to edit.
 * Down arrow opens a menu with Edit and Delete.
 */
export function LoggedItemCard({
  id,
  name,
  serving = '1 Serving',
  protein = 20,
  carbs = 60,
  fat = 20,
  editHref,
  onDelete,
}: LoggedItemCardProps) {
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
    onDelete?.(id);
    setMenuOpen(false);
  };

  return (
    <div
      className="relative rounded-xl bg-white/5 border border-white/10 p-4 space-y-3 cursor-pointer hover:bg-white/8 transition-colors"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      aria-label={`Edit ${name}`}
    >
      {/* Header: name + serving + down arrow menu */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-medium text-base leading-tight flex-1 min-w-0">{name}</h3>
        <div className="flex items-center gap-1 shrink-0" ref={menuRef}>
          <span className="text-white/60 text-sm">{serving}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="p-1.5 text-white/60 hover:text-white transition-colors rounded"
            aria-label="Options"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown: Edit | Delete */}
      {menuOpen && (
        <div
          className="absolute right-4 top-12 z-20 min-w-[120px] rounded-lg bg-brand-900 border border-white/20 shadow-lg py-1"
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

      {/* Per-item macro breakdown bar: Protein | Carbs | Fat */}
      <div className="flex items-center rounded-full bg-white/10 overflow-hidden text-xs">
        <span className="flex-1 px-3 py-2 text-center text-white/70 border-r border-white/10">
          Protein {protein}%
        </span>
        <span className="flex-1 px-3 py-2 text-center text-white/70 border-r border-white/10">
          Carbs {carbs}%
        </span>
        <span className="flex-1 px-3 py-2 text-center text-white/70">
          Fat {fat}%
        </span>
      </div>
    </div>
  );
}
