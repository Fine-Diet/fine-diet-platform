/**
 * Tests for validateResultsPack
 * 
 * Tests Flow v2 validation and legacy fallback validation.
 */

import { validateResultsPack } from '../validateResultsPack';

describe('validateResultsPack', () => {
  describe('Flow v2 validation', () => {
    it('should validate complete Flow v2 structure', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test Headline',
            body: ['Paragraph 1', 'Paragraph 2'],
            snapshotTitle: 'Snapshot',
            snapshotBullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
            meaningTitle: 'Meaning',
            meaningBody: 'Meaning body text',
          },
          page2: {
            headline: 'First Steps',
            stepBullets: ['Step 1', 'Step 2', 'Step 3'],
            videoCtaLabel: 'Watch Video',
            videoAssetUrl: 'https://www.youtube.com/watch?v=ig61sqn2lyM',
          },
          page3: {
            problemHeadline: 'Problem',
            problemBody: ['Problem paragraph'],
            tryTitle: 'Try Title',
            tryBullets: ['Try 1', 'Try 2', 'Try 3'],
            tryCloser: 'Closer',
            mechanismTitle: 'Mechanism',
            mechanismBodyTop: 'Top',
            mechanismPills: ['Pill 1', 'Pill 2', 'Pill 3', 'Pill 4'],
            mechanismBodyBottom: 'Bottom',
            methodTitle: 'Method',
            methodBody: ['Method paragraph'],
            methodLearnTitle: 'Learn',
            methodLearnBullets: ['Learn 1', 'Learn 2', 'Learn 3'],
            methodCtaLabel: 'CTA',
            methodCtaUrl: '/method',
            methodEmailLinkLabel: 'Email Link',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject Flow v2 with missing required fields', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test Headline',
            // Missing body, snapshotBullets, meaningBody
          },
          page2: {
            // Missing required fields
          },
          page3: {
            // Missing required fields
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('flow.page1'))).toBe(true);
    });

    it('should reject Flow v2 with incorrect bullet counts', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test',
            body: ['Test'],
            snapshotTitle: 'Test',
            snapshotBullets: ['Only 2 bullets'], // Should be exactly 3
            meaningTitle: 'Test',
            meaningBody: 'Test',
          },
          page2: {
            headline: 'Test',
            stepBullets: ['Only 1'], // Should be exactly 3
            videoCtaLabel: 'Test',
            videoAssetUrl: 'https://www.youtube.com/watch?v=ig61sqn2lyM',
          },
          page3: {
            problemHeadline: 'Test',
            problemBody: ['Test'],
            tryTitle: 'Test',
            tryBullets: ['Only 2'], // Should be exactly 3
            tryCloser: 'Test',
            mechanismTitle: 'Test',
            mechanismBodyTop: 'Test',
            mechanismPills: ['Only 3'], // Should be exactly 4
            mechanismBodyBottom: 'Test',
            methodTitle: 'Test',
            methodBody: ['Test'],
            methodLearnTitle: 'Test',
            methodLearnBullets: ['Only 1'], // Should be exactly 3
            methodCtaLabel: 'Test',
            methodCtaUrl: '/method',
            methodEmailLinkLabel: 'Test',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('exactly 3'))).toBe(true);
      expect(result.errors.some(e => e.includes('Missing Mechanism Pills'))).toBe(true);
    });

    it('should reject Flow v2 with missing mechanismPills', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test',
            body: ['Test'],
            snapshotTitle: 'Test',
            snapshotBullets: ['1', '2', '3'],
            meaningTitle: 'Test',
            meaningBody: 'Test',
          },
          page2: {
            headline: 'Test',
            stepBullets: ['1', '2', '3'],
            videoCtaLabel: 'Test',
          },
          page3: {
            problemHeadline: 'Test',
            problemBody: ['Test'],
            tryTitle: 'Test',
            tryBullets: ['1', '2', '3'],
            tryCloser: 'Test',
            mechanismTitle: 'Test',
            mechanismBodyTop: 'Test',
            // Missing mechanismPills
            mechanismBodyBottom: 'Test',
            methodTitle: 'Test',
            methodBody: ['Test'],
            methodLearnTitle: 'Test',
            methodLearnBullets: ['1', '2', '3'],
            methodCtaLabel: 'Test',
            methodCtaUrl: '/method',
            methodEmailLinkLabel: 'Test',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('Missing Mechanism Pills'))).toBe(true);
    });

    it('should reject Flow v2 with missing videoAssetUrl', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test',
            body: ['Test'],
            snapshotTitle: 'Test',
            snapshotBullets: ['1', '2', '3'],
            meaningTitle: 'Test',
            meaningBody: 'Test',
          },
          page2: {
            headline: 'Test',
            stepBullets: ['1', '2', '3'],
            videoCtaLabel: 'Test',
            // Missing videoAssetUrl
          },
          page3: {
            problemHeadline: 'Test',
            problemBody: ['Test'],
            tryTitle: 'Test',
            tryBullets: ['1', '2', '3'],
            tryCloser: 'Test',
            mechanismTitle: 'Test',
            mechanismBodyTop: 'Test',
            mechanismPills: ['1', '2', '3', '4'],
            mechanismBodyBottom: 'Test',
            methodTitle: 'Test',
            methodBody: ['Test'],
            methodLearnTitle: 'Test',
            methodLearnBullets: ['1', '2', '3'],
            methodCtaLabel: 'Test',
            methodCtaUrl: '/method',
            methodEmailLinkLabel: 'Test',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('Video Asset URL'))).toBe(true);
    });

    it('should reject Flow v2 with invalid YouTube URL', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test',
            body: ['Test'],
            snapshotTitle: 'Test',
            snapshotBullets: ['1', '2', '3'],
            meaningTitle: 'Test',
            meaningBody: 'Test',
          },
          page2: {
            headline: 'Test',
            stepBullets: ['1', '2', '3'],
            videoCtaLabel: 'Test',
            videoAssetUrl: 'not-a-valid-youtube-url',
          },
          page3: {
            problemHeadline: 'Test',
            problemBody: ['Test'],
            tryTitle: 'Test',
            tryBullets: ['1', '2', '3'],
            tryCloser: 'Test',
            mechanismTitle: 'Test',
            mechanismBodyTop: 'Test',
            mechanismPills: ['1', '2', '3', '4'],
            mechanismBodyBottom: 'Test',
            methodTitle: 'Test',
            methodBody: ['Test'],
            methodLearnTitle: 'Test',
            methodLearnBullets: ['1', '2', '3'],
            methodCtaLabel: 'Test',
            methodCtaUrl: '/method',
            methodEmailLinkLabel: 'Test',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('Breakdown Video must be a valid YouTube URL'))).toBe(true);
    });

    it('should accept Flow v2 with valid YouTube URL', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test',
            body: ['Test'],
            snapshotTitle: 'Test',
            snapshotBullets: ['1', '2', '3'],
            meaningTitle: 'Test',
            meaningBody: 'Test',
          },
          page2: {
            headline: 'Test',
            stepBullets: ['1', '2', '3'],
            videoCtaLabel: 'Test',
            videoAssetUrl: 'https://www.youtube.com/watch?v=ig61sqn2lyM&t=50s',
          },
          page3: {
            problemHeadline: 'Test',
            problemBody: ['Test'],
            tryTitle: 'Test',
            tryBullets: ['1', '2', '3'],
            tryCloser: 'Test',
            mechanismTitle: 'Test',
            mechanismBodyTop: 'Test',
            mechanismPills: ['1', '2', '3', '4'],
            mechanismBodyBottom: 'Test',
            methodTitle: 'Test',
            methodBody: ['Test'],
            methodLearnTitle: 'Test',
            methodLearnBullets: ['1', '2', '3'],
            methodCtaLabel: 'Test',
            methodCtaUrl: '/method',
            methodEmailLinkLabel: 'Test',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject Flow v2 with missing methodCtaUrl', () => {
      const pack = {
        label: 'Test Pack',
        flow: {
          page1: {
            headline: 'Test',
            body: ['Test'],
            snapshotTitle: 'Test',
            snapshotBullets: ['1', '2', '3'],
            meaningTitle: 'Test',
            meaningBody: 'Test',
          },
          page2: {
            headline: 'Test',
            stepBullets: ['1', '2', '3'],
            videoCtaLabel: 'Test',
            videoAssetUrl: 'https://www.youtube.com/watch?v=ig61sqn2lyM',
          },
          page3: {
            problemHeadline: 'Test',
            problemBody: ['Test'],
            tryTitle: 'Test',
            tryBullets: ['1', '2', '3'],
            tryCloser: 'Test',
            mechanismTitle: 'Test',
            mechanismBodyTop: 'Test',
            mechanismPills: ['1', '2', '3', '4'],
            mechanismBodyBottom: 'Test',
            methodTitle: 'Test',
            methodBody: ['Test'],
            methodLearnTitle: 'Test',
            methodLearnBullets: ['1', '2', '3'],
            methodCtaLabel: 'Test',
            // Missing methodCtaUrl
            methodEmailLinkLabel: 'Test',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('Method CTA URL'))).toBe(true);
    });
  });

  describe('Legacy validation', () => {
    it('should validate legacy pack with core fields', () => {
      const pack = {
        label: 'Test Pack',
        summary: 'Test summary',
        keyPatterns: ['Pattern 1', 'Pattern 2'],
        firstFocusAreas: ['Area 1', 'Area 2'],
        methodPositioning: 'Test positioning',
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject legacy pack missing required fields', () => {
      const pack = {
        label: 'Test Pack',
        // Missing summary, keyPatterns, firstFocusAreas
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('summary') || e.includes('keyPatterns') || e.includes('firstFocusAreas'))).toBe(true);
    });

    it('should warn about incomplete flow when legacy fields exist', () => {
      const pack = {
        label: 'Test Pack',
        summary: 'Test summary',
        keyPatterns: ['Pattern 1'],
        firstFocusAreas: ['Area 1'],
        flow: {
          page1: {
            // Incomplete flow
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(true); // Legacy fields are valid
      expect(result.warnings.some(w => w.includes('incomplete'))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should reject non-object input', () => {
      const result = validateResultsPack(null);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('Pack JSON must be an object.');
    });

    it('should reject empty object', () => {
      const result = validateResultsPack({});
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

