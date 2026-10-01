'use client';

import { useEffect, useRef, useState } from 'react';

export type RecipeEntryAction = 'manual' | 'text' | 'url';

const OPTIONS: Array<{ action: RecipeEntryAction; label: string }> = [
  { action: 'manual', label: 'Create from scratch' },
  { action: 'text', label: 'Copy & paste text' },
  { action: 'url', label: 'Import from a link' },
];

function scrollParent(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    const canScroll = current.scrollHeight > current.clientHeight + 1;
    if ((overflow === 'auto' || overflow === 'scroll') && canScroll) return current;
    current = current.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

export function RecipeEntryMenu({
  onAction,
}: {
  onAction: (action: RecipeEntryAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const footer = document.querySelector<HTMLElement>('[data-app-footer]');
      const footerTop = footer?.getBoundingClientRect().top ?? window.innerHeight;
      const rect = menu.getBoundingClientRect();
      const limit = footerTop - 8;
      if (rect.bottom <= limit) return;
      const delta = rect.bottom - limit;
      const scroller = scrollParent(menu);
      if (scroller) scroller.scrollBy({ top: delta });
      else window.scrollBy({ top: delta });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div ref={rootRef} className="mx-auto mt-4 w-full max-w-[600px]">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex min-h-10 w-full items-center justify-center rounded-full border border-white/15 px-5 text-sm font-normal text-white/45 transition-colors hover:border-white/30 hover:text-white"
      >
        <span>Add a recipe.</span>
        <span aria-hidden className="absolute right-5 text-lg font-normal">+</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Add a recipe"
          className="mt-2 rounded-[20px] border border-white/20 bg-[#211b15] p-2 shadow-large"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.action}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAction(option.action);
              }}
              className="flex w-full rounded-xl px-4 py-3 text-left text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
