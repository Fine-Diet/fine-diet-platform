import { groceryListDeleteRejection } from '@/lib/plans/groceryListDeleteRejection';

describe('groceryListDeleteRejection', () => {
  it('maps empty-list server rejection to in-modal copy and Archive instead', () => {
    const mapped = groceryListDeleteRejection(
      'Only empty lists can be deleted. Archive lists with items instead.',
    );
    expect(mapped.suggestArchive).toBe(true);
    expect(mapped.userMessage).toMatch(/still has items/i);
    expect(mapped.userMessage).toMatch(/archive instead/i);
  });

  it('passes through non-empty-related failures without forcing Archive', () => {
    const mapped = groceryListDeleteRejection('The default My Grocery List cannot be deleted.');
    expect(mapped.suggestArchive).toBe(false);
    expect(mapped.userMessage).toBe('The default My Grocery List cannot be deleted.');
  });
});
