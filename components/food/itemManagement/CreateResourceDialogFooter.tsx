'use client';

interface CreateResourceDialogFooterProps {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  secondaryLabel?: string;
  onSecondary: () => void;
  secondaryDisabled?: boolean;
}

export function CreateResourceDialogFooter({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryBusy = false,
  onSecondary,
  secondaryDisabled = false,
  secondaryLabel = 'Cancel',
}: CreateResourceDialogFooterProps) {
  return (
    <div className="flex w-full flex-col items-stretch gap-3">
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryBusy}
        className="min-h-11 w-full rounded-full bg-brand-50 px-5 py-2.5 text-sm font-semibold text-[#16110d] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={onSecondary}
        disabled={secondaryDisabled || primaryBusy}
        className="min-h-10 w-full text-sm text-white/55 disabled:opacity-40"
      >
        {secondaryLabel}
      </button>
    </div>
  );
}
