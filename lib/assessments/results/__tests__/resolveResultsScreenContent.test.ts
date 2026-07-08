/**
 * Tests for the pure results-screen content resolver.
 *
 * Covers flow detection (Flow v2 vs legacy vs minimal), page-content extraction
 * with flow-first / legacy fallback, defaulting of optional titles, and video
 * URL normalization (YouTube → embed URL, internal routes passed through).
 */

import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';
import {
  detectResultsFlow,
  resolveResultsScreenContent,
  normalizeVideoUrl,
} from '@/lib/assessments/results/resolveResultsScreenContent';

function makeFlowV2Pack(overrides: Partial<ResultsPack['flow']> = {}): ResultsPack {
  const basePage1 = {
    headline: 'Flow P1 Headline',
    body: ['p1 para a', 'p1 para b'],
    snapshotBullets: ['s1', 's2', 's3'],
    meaningBody: 'meaning body',
  };
  const basePage2 = {
    headline: 'Flow P2 Headline',
    stepBullets: ['st1', 'st2', 'st3'],
    videoCtaLabel: 'Watch the video',
    videoAssetUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  const basePage3 = {
    problemHeadline: 'Problem H',
    problemBody: ['problem para'],
    tryBullets: ['t1', 't2', 't3'],
    mechanismTitle: 'Mech Title',
    mechanismBodyTop: 'mech top',
    mechanismPills: ['p1', 'p2'],
    methodTitle: 'Method Title',
    methodBody: ['method para'],
    methodLearnBullets: ['l1', 'l2', 'l3'],
    methodCtaLabel: 'Watch Method',
    methodCtaUrl: '/method',
    methodEmailLinkLabel: 'Email me the link',
  };
  return {
    label: 'Flow Label',
    summary: 'flow summary',
    keyPatterns: ['kp1', 'kp2', 'kp3'],
    firstFocusAreas: ['ff1', 'ff2', 'ff3'],
    methodPositioning: 'flow positioning',
    flow: {
      page1: { ...basePage1, ...((overrides as any).page1 ?? {}) },
      page2: { ...basePage2, ...((overrides as any).page2 ?? {}) },
      page3: { ...basePage3, ...((overrides as any).page3 ?? {}) },
    },
  };
}

function makeLegacyPack(): ResultsPack {
  return {
    label: 'Legacy Label',
    summary: 'legacy summary',
    keyPatterns: ['lk1', 'lk2', 'lk3', 'lk4'],
    firstFocusAreas: ['lf1', 'lf2', 'lf3'],
    methodPositioning: 'legacy positioning',
  };
}

function makeMinimalPack(): ResultsPack {
  // A pack with neither Flow v2 structure nor the legacy core fields. In
  // practice gut-check packs always carry keyPatterns/firstFocusAreas arrays,
  // so the "no legacy fields" case requires those to be absent (not empty
  // arrays, which are truthy and would still trip the legacy detection).
  return {
    label: 'Minimal',
    summary: 'minimal summary',
    keyPatterns: undefined as any,
    firstFocusAreas: undefined as any,
    methodPositioning: '',
  };
}

describe('detectResultsFlow', () => {
  it('flags a complete Flow v2 pack', () => {
    const d = detectResultsFlow(makeFlowV2Pack());
    expect(d.hasFlowV2).toBe(true);
    expect(d.hasLegacyFields).toBe(true); // pack also carries core fields
    expect(d.renderMultiPage).toBe(true);
  });

  it('flags a legacy pack (core fields, no flow)', () => {
    const d = detectResultsFlow(makeLegacyPack());
    expect(d.hasFlowV2).toBe(false);
    expect(d.hasLegacyFields).toBe(true);
    expect(d.renderMultiPage).toBe(true);
  });

  it('flags a minimal pack as non-multi-page', () => {
    const d = detectResultsFlow(makeMinimalPack());
    expect(d.hasFlowV2).toBe(false);
    expect(d.hasLegacyFields).toBe(false);
    expect(d.renderMultiPage).toBe(false);
  });

  it('does not treat a partial flow as Flow v2', () => {
    const pack = makeFlowV2Pack({ page3: { mechanismPills: undefined } } as any);
    const d = detectResultsFlow(pack);
    expect(d.hasFlowV2).toBe(false);
    // Still has legacy fields, so multi-page stays true.
    expect(d.renderMultiPage).toBe(true);
  });

  it('treats Flow v2 without video fields as Flow v2', () => {
    const pack = makeFlowV2Pack({
      page2: {
        headline: 'No video',
        stepBullets: ['a', 'b', 'c'],
        videoAssetUrl: '',
      },
    } as any);
    const d = detectResultsFlow(pack);
    expect(d.hasFlowV2).toBe(true);
    expect(d.renderMultiPage).toBe(true);
  });
});

describe('resolveResultsScreenContent — Flow v2', () => {
  it('pulls page content from the flow structure', () => {
    const c = resolveResultsScreenContent(makeFlowV2Pack(), 'level2');
    expect(c.hasFlowV2).toBe(true);
    expect(c.renderMultiPage).toBe(true);

    expect(c.page1.headline).toBe('Flow P1 Headline');
    expect(c.page1.body).toEqual(['p1 para a', 'p1 para b']);
    expect(c.page1.snapshotBullets).toEqual(['s1', 's2', 's3']);
    expect(c.page1.meaningBody).toBe('meaning body');

    expect(c.page2.headline).toBe('Flow P2 Headline');
    expect(c.page2.videoCtaLabel).toBe('Watch the video');

    expect(c.page3.problemHeadline).toBe('Problem H');
    expect(c.page3.mechanismPills).toEqual(['p1', 'p2']);
    expect(c.page3.methodCtaUrl).toBe('/method');
  });

  it('applies default snapshot/meaning titles when omitted', () => {
    const pack = makeFlowV2Pack({
      page1: { snapshotTitle: undefined, meaningTitle: undefined },
    } as any);
    const c = resolveResultsScreenContent(pack, 'level1');
    expect(c.page1.snapshotTitle).toBe("What We're Seeing");
    expect(c.page1.meaningTitle).toBe("What This Often Means");
  });

  it('converts a YouTube watch URL into an embed URL', () => {
    const c = resolveResultsScreenContent(makeFlowV2Pack(), 'level1');
    expect(c.videoUrl).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0'
    );
  });

  it('returns null videoUrl when Flow v2 omits videoAssetUrl', () => {
    const pack = makeFlowV2Pack({
      page2: {
        headline: 'Steps only',
        stepBullets: ['a', 'b', 'c'],
        videoAssetUrl: '',
        videoCtaLabel: undefined,
      },
    } as any);
    const c = resolveResultsScreenContent(pack, 'readiness-low');
    expect(c.hasFlowV2).toBe(true);
    expect(c.page2.videoAssetUrl).toBeNull();
    expect(c.videoUrl).toBeNull();
  });
});

describe('resolveResultsScreenContent — legacy fallback', () => {
  it('builds page content from core fields when no flow exists', () => {
    const c = resolveResultsScreenContent(makeLegacyPack(), 'level3');
    expect(c.hasFlowV2).toBe(false);
    expect(c.hasLegacyFields).toBe(true);
    expect(c.renderMultiPage).toBe(true);

    expect(c.page1.headline).toBe('Legacy Label');
    expect(c.page1.body).toEqual(['legacy summary']);
    expect(c.page1.snapshotBullets).toEqual(['lk1', 'lk2', 'lk3']); // sliced to 3
    expect(c.page1.meaningBody).toBe('legacy positioning');

    expect(c.page2.headline).toBe('First Steps');
    expect(c.page2.stepBullets).toEqual(['lf1', 'lf2', 'lf3']);
    expect(c.page2.videoCtaLabel).toBe('Watch Your Gut Pattern Breakdown');
    // Legacy video uses the deterministic level map; internal route passes through.
    expect(c.page2.videoAssetUrl).toBe('/gut-pattern-breakdown?level=3');
    expect(c.videoUrl).toBe('/gut-pattern-breakdown?level=3');

    expect(c.page3.problemHeadline).toBe('Most gut advice ignores patterns like this.');
    expect(c.page3.methodCtaLabel).toBe('Watch How The Fine Diet Method Works');
    expect(c.page3.methodCtaUrl).toBe('/method');
  });

  it('defaults snapshot bullets to three empty strings when keyPatterns is missing', () => {
    const pack: ResultsPack = {
      label: 'L',
      summary: 's',
      keyPatterns: undefined as any,
      firstFocusAreas: undefined as any,
      methodPositioning: 'mp',
    };
    const c = resolveResultsScreenContent(pack, 'level1');
    expect(c.page1.snapshotBullets).toEqual(['', '', '']);
    expect(c.page2.stepBullets).toEqual(['', '', '']);
  });
});

describe('resolveResultsScreenContent — minimal pack', () => {
  it('still resolves content (legacy branch) but is not multi-page', () => {
    const c = resolveResultsScreenContent(makeMinimalPack(), 'level1');
    expect(c.renderMultiPage).toBe(false);
    // Legacy branch still runs and produces a page1 from the label/summary.
    expect(c.page1.headline).toBe('Minimal');
    // No legacy fields and no flow → no video.
    expect(c.videoUrl).toBeNull();
  });
});

describe('normalizeVideoUrl', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizeVideoUrl(null)).toBeNull();
    expect(normalizeVideoUrl(undefined)).toBeNull();
    expect(normalizeVideoUrl('')).toBeNull();
  });

  it('passes non-YouTube URLs through unchanged', () => {
    expect(normalizeVideoUrl('/gut-pattern-breakdown?level=2')).toBe(
      '/gut-pattern-breakdown?level=2'
    );
    expect(normalizeVideoUrl('https://vimeo.com/12345')).toBe('https://vimeo.com/12345');
  });

  it('converts a youtu.be short URL into an embed URL', () => {
    expect(normalizeVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0'
    );
  });

  it('preserves a start time from a watch URL', () => {
    expect(normalizeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=60'
    );
  });
});
