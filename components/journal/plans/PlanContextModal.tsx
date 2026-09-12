'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export type PlanContextModalTab = 'library' | 'create-edit';

export interface PlanContextModalProps {
  title: string;
  titleId: string;
  closeLabel: string;
  tablistLabel: string;
  libraryTabLabel: string;
  createEditTabLabel: string;
  activeTab: PlanContextModalTab;
  onTabChange: (tab: PlanContextModalTab) => void;
  onClose: () => void;
  libraryPanel: ReactNode;
  createEditPanel: ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function PlanContextModal({
  title,
  titleId,
  closeLabel,
  tablistLabel,
  libraryTabLabel,
  createEditTabLabel,
  activeTab,
  onTabChange,
  onClose,
  libraryPanel,
  createEditPanel,
  returnFocusRef,
}: PlanContextModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const libraryPanelId = useId();
  const createEditPanelId = useId();

  useEffect(() => {
    const previousFocus = returnFocusRef?.current ?? document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
  }, [onClose, returnFocusRef]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-2 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white/15 bg-[#29231d] shadow-2xl sm:max-h-[90vh] sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-7">
          <h2 id={titleId} className="text-lg font-semibold sm:text-xl">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          >
            ×
          </button>
        </div>
        <div
          role="tablist"
          aria-label={tablistLabel}
          className="grid grid-cols-2 border-b border-white/10 px-3 pt-2 sm:px-7"
        >
          <button
            type="button"
            role="tab"
            id={`${libraryPanelId}-tab`}
            aria-selected={activeTab === 'library'}
            aria-controls={libraryPanelId}
            onClick={() => onTabChange('library')}
            className={`border-b-2 px-2 py-3 text-sm font-semibold ${activeTab === 'library' ? 'border-[#d7ecff] text-white' : 'border-transparent text-white/45'}`}
          >
            {libraryTabLabel}
          </button>
          <button
            type="button"
            role="tab"
            id={`${createEditPanelId}-tab`}
            aria-selected={activeTab === 'create-edit'}
            aria-controls={createEditPanelId}
            onClick={() => onTabChange('create-edit')}
            className={`border-b-2 px-2 py-3 text-sm font-semibold ${activeTab === 'create-edit' ? 'border-[#d7ecff] text-white' : 'border-transparent text-white/45'}`}
          >
            {createEditTabLabel}
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-10 sm:p-7">
          <div
            id={libraryPanelId}
            role="tabpanel"
            aria-labelledby={`${libraryPanelId}-tab`}
            hidden={activeTab !== 'library'}
            className={activeTab === 'library' ? undefined : 'hidden'}
          >
            {libraryPanel}
          </div>
          <div
            id={createEditPanelId}
            role="tabpanel"
            aria-labelledby={`${createEditPanelId}-tab`}
            hidden={activeTab !== 'create-edit'}
            className={activeTab === 'create-edit' ? undefined : 'hidden'}
          >
            {createEditPanel}
          </div>
        </div>
      </section>
    </div>
  );
}
