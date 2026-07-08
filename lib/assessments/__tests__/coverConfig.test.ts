/**
 * Assessment cover config — Baseline Readiness public surface (Packet X4a).
 */

import { getAssessmentEntry } from '../assessmentRegistry';
import { getAssessmentCoverConfig } from '../coverConfig';

describe('getAssessmentCoverConfig — baseline-readiness (Packet X4a)', () => {
  const entry = getAssessmentEntry('baseline-readiness')!;

  it('returns dedicated consumer-facing cover copy', () => {
    const cover = getAssessmentCoverConfig(entry);
    expect(cover.headline).toBe('Check your Baseline Readiness');
    expect(cover.subheadline).toContain('meal rhythm');
    expect(cover.ctaLabel).toBe('Start the readiness check');
    expect(cover.seoTitle).toBe('Baseline Readiness Assessment | Fine Diet');
    expect(cover.seoDescription).toContain('Fine Diet Method');
  });

  it('does not fall back to registry title as headline', () => {
    const cover = getAssessmentCoverConfig(entry);
    expect(cover.headline).not.toBe(entry.title);
  });
});

describe('getAssessmentCoverConfig — gut-check unchanged', () => {
  const entry = getAssessmentEntry('gut-check')!;

  it('keeps existing Gut Check cover copy', () => {
    const cover = getAssessmentCoverConfig(entry);
    expect(cover.headline).toBe('Find your gut’s starting point.');
    expect(cover.ctaLabel).toBe('Start the Gut Check');
    expect(cover.seoTitle).toBe('Gut Check Assessment — Fine Diet');
  });
});
