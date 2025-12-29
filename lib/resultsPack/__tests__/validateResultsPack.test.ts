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
          },
          page3: {
            problemHeadline: 'Problem',
            problemBody: ['Problem paragraph'],
            tryTitle: 'Try Title',
            tryBullets: ['Try 1', 'Try 2', 'Try 3'],
            tryCloser: 'Closer',
            mechanismTitle: 'Mechanism',
            mechanismBodyTop: 'Top',
            mechanismBodyBottom: 'Bottom',
            methodTitle: 'Method',
            methodBody: ['Method paragraph'],
            methodLearnTitle: 'Learn',
            methodLearnBullets: ['Learn 1', 'Learn 2', 'Learn 3'],
            methodCtaLabel: 'CTA',
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
          },
          page3: {
            problemHeadline: 'Test',
            problemBody: ['Test'],
            tryTitle: 'Test',
            tryBullets: ['Only 2'], // Should be exactly 3
            tryCloser: 'Test',
            mechanismTitle: 'Test',
            mechanismBodyTop: 'Test',
            mechanismBodyBottom: 'Test',
            methodTitle: 'Test',
            methodBody: ['Test'],
            methodLearnTitle: 'Test',
            methodLearnBullets: ['Only 1'], // Should be exactly 3
            methodCtaLabel: 'Test',
            methodEmailLinkLabel: 'Test',
          },
        },
      };

      const result = validateResultsPack(pack);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('exactly 3'))).toBe(true);
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

