/**
 * Map delete API failures for the grocery list confirmation modal.
 * Kept separate from the page module so it can be unit-tested without
 * loading the Next.js page (dynamic `[listId]` route path).
 */
export function groceryListDeleteRejection(message: string): {
  userMessage: string;
  suggestArchive: boolean;
} {
  if (/empty|items/i.test(message)) {
    return {
      userMessage: 'This list still has items. Remove all items first, or archive instead.',
      suggestArchive: true,
    };
  }
  return { userMessage: message || 'Failed to delete list.', suggestArchive: false };
}
