import { buildChips } from '@/components/journal/DailySummary';

describe('Daily Summary capture chips', () => {
  it('marks Notes as coming soon without linking to unsupported note capture', () => {
    const notes = buildChips(new Date(2026, 9, 25), [], []).find((chip) => chip.id === 'notes');
    expect(notes).toMatchObject({ label: 'Notes', detail: 'Coming soon', href: null, disabled: true });
  });
});
