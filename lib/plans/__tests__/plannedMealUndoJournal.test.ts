import { removeLinkedJournalEntryForUndo } from '../plannedMealUndoJournal';
import { deleteEntry, getEntry } from '@/lib/journal/journalServerService';

jest.mock('@/lib/journal/journalServerService', () => ({
  getEntry: jest.fn(),
  deleteEntry: jest.fn(),
}));

const mockedGetEntry = getEntry as jest.MockedFunction<typeof getEntry>;
const mockedDeleteEntry = deleteEntry as jest.MockedFunction<typeof deleteEntry>;

describe('removeLinkedJournalEntryForUndo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips delete when the journal entry is already absent', async () => {
    mockedGetEntry.mockResolvedValue(null);
    await removeLinkedJournalEntryForUndo('person-1', 'entry-1');
    expect(mockedDeleteEntry).not.toHaveBeenCalled();
  });

  it('deletes when the journal entry exists', async () => {
    mockedGetEntry.mockResolvedValue({ id: 'entry-1' } as Awaited<ReturnType<typeof getEntry>>);
    mockedDeleteEntry.mockResolvedValue(true);
    await removeLinkedJournalEntryForUndo('person-1', 'entry-1');
    expect(mockedDeleteEntry).toHaveBeenCalledWith('person-1', 'entry-1');
  });

  it('propagates delete failures instead of swallowing them', async () => {
    mockedGetEntry.mockResolvedValue({ id: 'entry-1' } as Awaited<ReturnType<typeof getEntry>>);
    mockedDeleteEntry.mockRejectedValue(new Error('Database unavailable'));
    await expect(removeLinkedJournalEntryForUndo('person-1', 'entry-1')).rejects.toThrow(
      'Database unavailable',
    );
  });
});
