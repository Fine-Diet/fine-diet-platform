'use client';

import type { ReactNode } from 'react';

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
}: PlanContextModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-2 sm:p-6"
    >
      <section className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white/15 bg-[#29231d] shadow-2xl sm:max-h-[90vh] sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-7">
          <h2 id={titleId} className="text-lg font-semibold sm:text-xl">{title}</h2>
          <button
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
            aria-selected={activeTab === 'library'}
            onClick={() => onTabChange('library')}
            className={`border-b-2 px-2 py-3 text-sm font-semibold ${activeTab === 'library' ? 'border-[#d7ecff] text-white' : 'border-transparent text-white/45'}`}
          >
            {libraryTabLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'create-edit'}
            onClick={() => onTabChange('create-edit')}
            className={`border-b-2 px-2 py-3 text-sm font-semibold ${activeTab === 'create-edit' ? 'border-[#d7ecff] text-white' : 'border-transparent text-white/45'}`}
          >
            {createEditTabLabel}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-10 sm:p-7">
          {activeTab === 'library' ? libraryPanel : createEditPanel}
        </div>
      </section>
    </div>
  );
}
