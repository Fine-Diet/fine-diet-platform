export function canApplyReusableSnapshot(args: {
  dirty: boolean;
  saveBusy?: boolean;
}): boolean {
  return !args.dirty && !args.saveBusy;
}

export function reusableApplyDisabledReason(args: {
  dirty: boolean;
  saveBusy?: boolean;
}): string | null {
  if (args.saveBusy) return 'Save in progress…';
  if (args.dirty) return 'Save your changes before applying this reusable snapshot.';
  return null;
}
