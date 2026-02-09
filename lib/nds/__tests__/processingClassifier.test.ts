/**
 * Processing Classifier Tests
 * 
 * Tests for deterministic classification, override precedence, and versioning.
 */

import {
  classifyProcessingLevel,
  containsProteinPowder,
  isProteinBarOrRTD,
} from '../processingClassifier';
import { CLASSIFIER_VERSION } from '../types';

describe('Processing Classifier', () => {
  describe('classifyProcessingLevel', () => {
    describe('determinism', () => {
      it('returns same result for same input', () => {
        const input = {
          canonical_name: 'Apple',
          source_dataset: 'foundation',
          source_provider: 'usda',
        };
        
        const result1 = classifyProcessingLevel(input);
        const result2 = classifyProcessingLevel(input);
        
        expect(result1).toEqual(result2);
      });

      it('includes classifier_version in output', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Banana',
        });
        
        expect(result.classifier_version).toBe(CLASSIFIER_VERSION);
      });
    });

    describe('dataset-based classification', () => {
      it('classifies USDA Foundation as whole', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Spinach',
          source_dataset: 'foundation',
          source_provider: 'usda',
        });
        
        expect(result.processing_class).toBe('whole');
        expect(result.classifier_confidence).toBeGreaterThanOrEqual(0.8);
      });

      it('classifies USDA SR Legacy with whole food keyword as whole', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Chicken breast',
          source_dataset: 'sr_legacy',
          source_provider: 'usda',
        });
        
        // "chicken breast" matches whole food keyword → bumped to whole
        expect(result.processing_class).toBe('whole');
      });

      it('classifies USDA SR Legacy without keywords as minimally_processed', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Durian',
          source_dataset: 'sr_legacy',
          source_provider: 'usda',
        });
        
        expect(result.processing_class).toBe('minimally_processed');
      });

      it('classifies USDA Branded as ultra_processed', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Chips',
          source_dataset: 'branded',
          source_provider: 'usda',
        });
        
        expect(result.processing_class).toBe('ultra_processed');
      });

      it('classifies Fine Diet internal as processed by default', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Custom Food',
          source_provider: 'fine_diet',
        });
        
        expect(result.processing_class).toBe('processed');
      });
    });

    describe('keyword adjustments', () => {
      it('bumps UPF keywords to ultra_processed', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Instant Noodles',
          source_dataset: 'sr_legacy', // Would normally be minimally_processed
        });
        
        expect(result.processing_class).toBe('ultra_processed');
        expect(result.classification_reason).toContain('UPF keyword');
      });

      it('bumps whole food keywords to whole', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Fresh Raw Carrots',
          source_provider: 'user', // Would normally be processed
        });
        
        expect(result.processing_class).toBe('whole');
        expect(result.classification_reason).toContain('whole food keyword');
      });

      it('bumps minimally processed keywords appropriately', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Frozen Spinach',
          source_provider: 'user',
        });
        
        expect(result.processing_class).toBe('minimally_processed');
      });

      it('detects protein bar as UPF', () => {
        const result = classifyProcessingLevel({
          canonical_name: 'Quest Protein Bar',
          source_dataset: 'branded',
        });
        
        expect(result.processing_class).toBe('ultra_processed');
      });
    });

    describe('confidence scoring', () => {
      it('has higher confidence for Foundation dataset', () => {
        const foundationResult = classifyProcessingLevel({
          canonical_name: 'Broccoli',
          source_dataset: 'foundation',
        });
        
        const unknownResult = classifyProcessingLevel({
          canonical_name: 'Mystery Food',
        });
        
        expect(foundationResult.classifier_confidence).toBeGreaterThan(
          unknownResult.classifier_confidence
        );
      });

      it('increases confidence when keywords confirm classification', () => {
        const withKeyword = classifyProcessingLevel({
          canonical_name: 'Fresh Raw Durian',
          source_dataset: 'foundation',
        });
        
        // "Durian" has no keyword match — gets base foundation confidence only
        const withoutKeyword = classifyProcessingLevel({
          canonical_name: 'Durian',
          source_dataset: 'foundation',
        });
        
        expect(withKeyword.classifier_confidence).toBeGreaterThan(
          withoutKeyword.classifier_confidence
        );
      });
    });
  });

  describe('containsProteinPowder', () => {
    it('detects whey protein', () => {
      expect(containsProteinPowder({ canonical_name: 'Whey Protein Isolate' })).toBe(true);
    });

    it('detects casein protein', () => {
      expect(containsProteinPowder({ canonical_name: 'Casein Protein Powder' })).toBe(true);
    });

    it('detects protein in tags', () => {
      expect(containsProteinPowder({ 
        canonical_name: 'Supplement',
        tags: ['protein isolate', 'fitness'],
      })).toBe(true);
    });

    it('does not flag regular protein foods', () => {
      expect(containsProteinPowder({ canonical_name: 'Chicken Breast' })).toBe(false);
    });
  });

  describe('isProteinBarOrRTD', () => {
    it('detects protein bars', () => {
      expect(isProteinBarOrRTD({ canonical_name: 'Protein Bar Chocolate' })).toBe(true);
    });

    it('detects RTD', () => {
      expect(isProteinBarOrRTD({ canonical_name: 'Ready to Drink Shake' })).toBe(true);
    });

    it('detects meal replacement', () => {
      expect(isProteinBarOrRTD({ canonical_name: 'Meal Replacement Shake' })).toBe(true);
    });

    it('does not flag regular foods', () => {
      expect(isProteinBarOrRTD({ canonical_name: 'Grilled Salmon' })).toBe(false);
    });
  });
});
