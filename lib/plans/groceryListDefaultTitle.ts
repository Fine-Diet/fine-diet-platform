/** Founder default for explicit New List creation (local calendar day). */
export function defaultNamedGroceryListTitle(now = new Date()): string {
  const dateLabel = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `List — ${dateLabel}`;
}
