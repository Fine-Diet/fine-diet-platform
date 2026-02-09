/**
 * NOVA Mapping Tests
 * 
 * Tests for NOVA derivation from processing_class and override precedence.
 */

import {
  PROCESSING_CLASS_TO_NOVA,
  NOVA_WFR_CREDIT,
  getEffectiveProcessingClass,
  getNOVA,
  getWFRCredit,
  getFoodWFRCredit,
  getNOVALabel,
} from '../novaMapping';
import type { ProcessingClass, NOVALevel } from '../types';

describe('NOVA Mapping', () => {
  describe('PROCESSING_CLASS_TO_NOVA mapping', () => {
    it('maps whole to NOVA 1', () => {
      expect(PROCESSING_CLASS_TO_NOVA['whole']).toBe(1);
    });

    it('maps minimally_processed to NOVA 2', () => {
      expect(PROCESSING_CLASS_TO_NOVA['minimally_processed']).toBe(2);
    });

    it('maps processed to NOVA 3', () => {
      expect(PROCESSING_CLASS_TO_NOVA['processed']).toBe(3);
    });

    it('maps ultra_processed to NOVA 4', () => {
      expect(PROCESSING_CLASS_TO_NOVA['ultra_processed']).toBe(4);
    });

    it('covers all processing classes', () => {
      const classes: ProcessingClass[] = ['whole', 'minimally_processed', 'processed', 'ultra_processed'];
      classes.forEach(pc => {
        expect(PROCESSING_CLASS_TO_NOVA[pc]).toBeDefined();
        expect(PROCESSING_CLASS_TO_NOVA[pc]).toBeGreaterThanOrEqual(1);
        expect(PROCESSING_CLASS_TO_NOVA[pc]).toBeLessThanOrEqual(4);
      });
    });
  });

  describe('NOVA_WFR_CREDIT', () => {
    it('gives full credit (1.0) for NOVA 1', () => {
      expect(NOVA_WFR_CREDIT[1]).toBe(1.0);
    });

    it('gives full credit (1.0) for NOVA 2', () => {
      expect(NOVA_WFR_CREDIT[2]).toBe(1.0);
    });

    it('gives partial credit (0.5) for NOVA 3 (Decision 2)', () => {
      // Decision 2: NOVA3 gets partial credit
      expect(NOVA_WFR_CREDIT[3]).toBe(0.5);
    });

    it('gives no credit (0.0) for NOVA 4', () => {
      expect(NOVA_WFR_CREDIT[4]).toBe(0.0);
    });
  });

  describe('getEffectiveProcessingClass', () => {
    it('returns processing_class when no override', () => {
      const result = getEffectiveProcessingClass({
        processing_class: 'whole',
        processing_class_override: null,
      });
      expect(result).toBe('whole');
    });

    it('returns override when present (override precedence)', () => {
      const result = getEffectiveProcessingClass({
        processing_class: 'ultra_processed', // Heuristic says UPF
        processing_class_override: 'processed', // Admin override to processed
      });
      expect(result).toBe('processed'); // Override wins
    });

    it('returns null when both are null', () => {
      const result = getEffectiveProcessingClass({
        processing_class: null,
        processing_class_override: null,
      });
      expect(result).toBeNull();
    });

    it('returns override even when processing_class is null', () => {
      const result = getEffectiveProcessingClass({
        processing_class: null,
        processing_class_override: 'whole',
      });
      expect(result).toBe('whole');
    });
  });

  describe('getNOVA', () => {
    it('derives NOVA from effective processing_class', () => {
      expect(getNOVA({ processing_class: 'whole', processing_class_override: null })).toBe(1);
      expect(getNOVA({ processing_class: 'minimally_processed', processing_class_override: null })).toBe(2);
      expect(getNOVA({ processing_class: 'processed', processing_class_override: null })).toBe(3);
      expect(getNOVA({ processing_class: 'ultra_processed', processing_class_override: null })).toBe(4);
    });

    it('uses override in NOVA derivation', () => {
      // Heuristic says whole (NOVA 1), but override says ultra_processed (NOVA 4)
      const result = getNOVA({
        processing_class: 'whole',
        processing_class_override: 'ultra_processed',
      });
      expect(result).toBe(4); // Should use override
    });

    it('returns null for unclassified food', () => {
      const result = getNOVA({
        processing_class: null,
        processing_class_override: null,
      });
      expect(result).toBeNull();
    });
  });

  describe('getWFRCredit', () => {
    it('returns credit for valid NOVA levels', () => {
      expect(getWFRCredit(1)).toBe(1.0);
      expect(getWFRCredit(2)).toBe(1.0);
      expect(getWFRCredit(3)).toBe(0.5);
      expect(getWFRCredit(4)).toBe(0.0);
    });

    it('returns 0.5 for null NOVA (neutral default for unclassified foods)', () => {
      expect(getWFRCredit(null)).toBe(0.5);
    });
  });

  describe('getFoodWFRCredit', () => {
    it('combines getNOVA and getWFRCredit', () => {
      const food = { processing_class: 'whole' as ProcessingClass, processing_class_override: null };
      expect(getFoodWFRCredit(food)).toBe(1.0);
    });

    it('uses override in credit calculation', () => {
      const food = {
        processing_class: 'whole' as ProcessingClass, // Would be 1.0
        processing_class_override: 'ultra_processed' as ProcessingClass, // Override to 0.0
      };
      expect(getFoodWFRCredit(food)).toBe(0.0);
    });
  });

  describe('getNOVALabel', () => {
    it('returns labels for all NOVA levels', () => {
      expect(getNOVALabel(1)).toContain('Unprocessed');
      expect(getNOVALabel(2)).toContain('Minimally');
      expect(getNOVALabel(3)).toContain('Processed');
      expect(getNOVALabel(4)).toContain('Ultra');
    });

    it('returns Unknown for null', () => {
      expect(getNOVALabel(null)).toBe('Unknown');
    });
  });

  describe('determinism', () => {
    it('produces consistent results for same inputs', () => {
      const food = {
        processing_class: 'processed' as ProcessingClass,
        processing_class_override: null,
      };
      
      const results = Array(10).fill(null).map(() => getNOVA(food));
      expect(new Set(results).size).toBe(1); // All results should be identical
    });
  });
});
