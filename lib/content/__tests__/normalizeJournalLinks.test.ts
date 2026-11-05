import { describe, expect, it } from '@jest/globals';
import { normalizeJournalHref, normalizeJournalLinks } from '../normalizeJournalLinks';

describe('Journal content link normalization', () => {
  it('routes the retired Journal host through the canonical member gate', () => {
    expect(normalizeJournalHref('https://journal.myfinediet.com/')).toBe('/app/log');
    expect(normalizeJournalHref('https://journal.myfinediet.com/login?redirect=%2Fjournal')).toBe(
      '/app/log',
    );
  });

  it('maps legacy Journal deep links to canonical app routes and preserves safe query/hash data', () => {
    expect(normalizeJournalHref('https://journal.myfinediet.com/journal/onboarding?resume=1#setup')).toBe(
      '/app/onboarding?resume=1#setup',
    );
    expect(normalizeJournalHref('/journal/log?entry=new')).toBe('/app/log/new?entry=new');
  });

  it('preserves unrelated external links and recursively normalizes content hrefs', () => {
    const source = {
      hero: { buttons: [{ href: 'https://journal.myfinediet.com/' }] },
      footer: { href: 'https://example.com/resources' },
    };

    expect(normalizeJournalLinks(source)).toEqual({
      hero: { buttons: [{ href: '/app/log' }] },
      footer: { href: 'https://example.com/resources' },
    });
  });
});
