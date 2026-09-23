/**
 * Expected shelf life stays in a native <details> disclosure.
 * When exact expiration is set, disclosure open state must remain uncontrolled
 * so editing the input does not re-collapse the panel on re-render.
 */
export function expectedShelfLifeDetailsProps(
  expiresOn: string,
  expectedShelfLifeDays: string,
): { open?: boolean } {
  const hasExactExpiration = Boolean(expiresOn.trim());
  if (hasExactExpiration) {
    return {};
  }
  if (expectedShelfLifeDays.trim()) {
    return { open: true };
  }
  return {};
}
