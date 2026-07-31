'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

export type AddNewBranch = 'meal' | 'recipe' | null;

export type AddNewActionId =
  | 'meal-from-scratch'
  | 'meal-start-from-recipe'
  | 'recipe-manual'
  | 'recipe-paste'
  | 'recipe-url'
  | 'recipe-upload';

const MENU_SURFACE =
  'rounded-[28px] border border-white/30 bg-brand-900 shadow-large';

export function AddNewMenu({
  onAction,
}: {
  onAction: (action: AddNewActionId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState<AddNewBranch>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const titleId = useId();

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.min(320, Math.max(260, window.innerWidth - 32));
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - menuWidth - 16);
    const estimatedHeight = menu?.offsetHeight || 280;
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const openUpward = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    const top = openUpward
      ? Math.max(16, rect.top - estimatedHeight - 10)
      : rect.bottom + 10;
    setCoords({
      top,
      left,
      width: menuWidth,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updatePosition, branch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        setBranch(null);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      setBranch(null);
    };
    // Defer outside-dismiss binding so the opening click cannot immediately close the menu.
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointer);
      window.addEventListener('touchstart', onPointer);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (!next) setBranch(null);
      return next;
    });
  }

  function runAction(action: AddNewActionId) {
    setOpen(false);
    setBranch(null);
    onAction(action);
  }

  return (
    <div className="relative overflow-visible">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
        className={cn(
          'inline-flex items-center rounded-full border border-white px-5 py-2 text-base font-semibold text-white antialiased',
          'transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/50',
        )}
      >
        + Add New
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-labelledby={titleId}
            style={
              coords
                ? { top: coords.top, left: coords.left, width: coords.width }
                : { visibility: 'hidden', top: 0, left: 0, width: 280 }
            }
            className={cn(
              'fixed z-[80] max-h-[min(70vh,520px)] overflow-y-auto p-4',
              MENU_SURFACE,
            )}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <p id={titleId} className="text-sm text-white/50 antialiased">
                Add New
              </p>
              <button
                type="button"
                aria-label="Close Add New menu"
                onClick={() => {
                  setOpen(false);
                  setBranch(null);
                  triggerRef.current?.focus();
                }}
                className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span aria-hidden className="block text-lg leading-none">
                  ×
                </span>
              </button>
            </div>

            <MenuParent
              label="Meal"
              expanded={branch === 'meal'}
              onToggle={() => setBranch((prev) => (prev === 'meal' ? null : 'meal'))}
            >
              <MenuChild
                label="Build From Scratch"
                onSelect={() => runAction('meal-from-scratch')}
              />
              <MenuChild
                label="Start From A Recipe"
                onSelect={() => runAction('meal-start-from-recipe')}
              />
            </MenuParent>

            <MenuParent
              label="Recipe"
              expanded={branch === 'recipe'}
              onToggle={() => setBranch((prev) => (prev === 'recipe' ? null : 'recipe'))}
            >
              <MenuChild label="Create Manually" onSelect={() => runAction('recipe-manual')} />
              <MenuChild label="Copy & Paste" onSelect={() => runAction('recipe-paste')} />
              <MenuChild label="Add from URL" onSelect={() => runAction('recipe-url')} />
              <MenuChild
                label="Upload Image or PDF"
                onSelect={() => runAction('recipe-upload')}
              />
            </MenuParent>
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuParent({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        role="menuitem"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-base font-medium text-white antialiased',
          'transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10',
          expanded && 'bg-black/25',
        )}
      >
        <span>{label}</span>
        <span aria-hidden className="text-xs text-white">
          {expanded ? '▼' : '▶'}
        </span>
      </button>
      {expanded && <div className="pb-1 pl-4">{children}</div>}
    </div>
  );
}

function MenuChild({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center rounded-xl px-3 py-2.5 text-left text-base text-white/90 antialiased',
        'transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10',
      )}
    >
      {label}
    </button>
  );
}
