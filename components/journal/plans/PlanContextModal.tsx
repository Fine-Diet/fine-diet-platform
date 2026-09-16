'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS } from '@/components/layout/SignedInPageShell';
import { cn } from '@/lib/utils';

export type PlanContextModalTab = 'library' | 'create-edit';

export interface PlanContextModalProps {
  /** Accessible dialog name (may be visually hidden). */
  dialogLabel: string;
  titleId: string;
  closeLabel: string;
  libraryTabLabel: string;
  createEditTabLabel?: string;
  tablistLabel?: string;
  activeTab?: PlanContextModalTab;
  onTabChange?: (tab: PlanContextModalTab) => void;
  onClose: () => void;
  libraryPanel: ReactNode;
  createEditPanel?: ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function PlanContextModal({
  dialogLabel,
  titleId,
  closeLabel,
  libraryTabLabel,
  createEditTabLabel,
  tablistLabel,
  activeTab = 'library',
  onTabChange,
  onClose,
  libraryPanel,
  createEditPanel,
  returnFocusRef,
}: PlanContextModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const libraryPanelId = useId();
  const createEditPanelId = useId();
  const hasCreateEdit = Boolean(createEditTabLabel && createEditPanel);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = returnFocusRef?.current ?? document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [returnFocusRef]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={cn(
        'fixed top-0 right-0 bottom-0 left-0 z-[80] overflow-y-auto bg-neutral-900/90 backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS,
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-4 pb-16 pt-6 sm:px-8 sm:pt-10"
      >
        <div className="flex items-start justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="px-1 py-1 text-sm font-semibold text-white/70 transition hover:text-white"
          >
            Close
          </button>
        </div>

        <h2 id={titleId} className="sr-only">{dialogLabel}</h2>

        {hasCreateEdit ? (
          <div
            role="tablist"
            aria-label={tablistLabel ?? 'Plans library navigation'}
            className="mt-4 grid grid-cols-2 border-b border-white/10"
          >
            <button
              type="button"
              role="tab"
              id={`${libraryPanelId}-tab`}
              aria-selected={activeTab === 'library'}
              aria-controls={libraryPanelId}
              onClick={() => onTabChange?.('library')}
              className={`border-b px-2 py-3 text-left text-lg font-medium transition sm:text-xl ${
                activeTab === 'library'
                  ? 'border-white/50 text-white'
                  : 'border-transparent text-white/40 hover:text-white/60'
              }`}
            >
              {libraryTabLabel}
            </button>
            <button
              type="button"
              role="tab"
              id={`${createEditPanelId}-tab`}
              aria-selected={activeTab === 'create-edit'}
              aria-controls={createEditPanelId}
              onClick={() => onTabChange?.('create-edit')}
              className={`border-b px-2 py-3 text-left text-lg font-medium transition sm:text-xl ${
                activeTab === 'create-edit'
                  ? 'border-white/50 text-white'
                  : 'border-transparent text-white/40 hover:text-white/60'
              }`}
            >
              {createEditTabLabel}
            </button>
          </div>
        ) : (
          <div className="mt-4 border-b border-white/10">
            <p
              role="heading"
              aria-level={2}
              className="border-b border-white/50 px-2 py-3 text-left text-2xl font-medium text-white sm:text-2xl"
            >
              {libraryTabLabel}
            </p>
          </div>
        )}

        <div className="relative min-h-0 flex-1 pt-3">
          <div
            id={libraryPanelId}
            role={hasCreateEdit ? 'tabpanel' : undefined}
            aria-labelledby={hasCreateEdit ? `${libraryPanelId}-tab` : undefined}
            hidden={hasCreateEdit ? activeTab !== 'library' : undefined}
            className={hasCreateEdit && activeTab !== 'library' ? 'hidden' : undefined}
          >
            {libraryPanel}
          </div>
          {hasCreateEdit ? (
            <div
              id={createEditPanelId}
              role="tabpanel"
              aria-labelledby={`${createEditPanelId}-tab`}
              hidden={activeTab !== 'create-edit'}
              className={activeTab === 'create-edit' ? 'pt-2' : 'hidden'}
            >
              {createEditPanel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
