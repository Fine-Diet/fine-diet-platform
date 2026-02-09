/**
 * Tier Calculation Tests
 * 
 * Tests for protein score boundaries, PSQ multiplier effects, and tier calculations.
 */

import {
  calculatePAGAPoints,
  calculatePCCPoints,
  calculateWFRPoints,
  calculateFPPoints,
  calculateASPoints,
  calculateMNCPoints,
  calculatePNDPoints,
  calculateOBPointsFromRatio,
  calculateOBPointsFallback,
  calculateMealProteinScore,
} from '../tiers';

describe('Tier Calculations', () => {
  describe('calculatePAGAPoints (Protein Absolute Grams)', () => {
    it('returns 10 for >=35g protein', () => {
      expect(calculatePAGAPoints(35)).toBe(10);
      expect(calculatePAGAPoints(50)).toBe(10);
    });

    it('returns 8 for 25-34g protein', () => {
      expect(calculatePAGAPoints(25)).toBe(8);
      expect(calculatePAGAPoints(34)).toBe(8);
    });

    it('returns 6 for 15-24g protein', () => {
      expect(calculatePAGAPoints(15)).toBe(6);
      expect(calculatePAGAPoints(24)).toBe(6);
    });

    it('returns 4 for 10-14g protein', () => {
      expect(calculatePAGAPoints(10)).toBe(4);
      expect(calculatePAGAPoints(14)).toBe(4);
    });

    it('returns 2 for <10g protein', () => {
      expect(calculatePAGAPoints(5)).toBe(2);
      expect(calculatePAGAPoints(0)).toBe(2);
    });
  });

  describe('calculatePCCPoints (Protein Calorie Contribution)', () => {
    it('returns 10 for >=30% protein calories', () => {
      // 30g protein * 4 = 120 kcal, 400 total = 30%
      expect(calculatePCCPoints(30, 400)).toBe(10);
      expect(calculatePCCPoints(40, 400)).toBe(10);
    });

    it('returns 8 for 20-29% protein calories', () => {
      // 25g protein * 4 = 100 kcal, 400 total = 25%
      expect(calculatePCCPoints(25, 400)).toBe(8);
      // 20g protein * 4 = 80 kcal, 400 total = 20%
      expect(calculatePCCPoints(20, 400)).toBe(8);
    });

    it('returns 6 for 15-19% protein calories', () => {
      // 15g protein * 4 = 60 kcal, 400 total = 15%
      expect(calculatePCCPoints(15, 400)).toBe(6);
    });

    it('returns 4 for 10-14% protein calories', () => {
      // 10g protein * 4 = 40 kcal, 400 total = 10%
      expect(calculatePCCPoints(10, 400)).toBe(4);
    });

    it('returns 2 for <10% protein calories', () => {
      // 8g protein * 4 = 32 kcal, 400 total = 8%
      expect(calculatePCCPoints(8, 400)).toBe(2);
    });

    it('returns 2 for zero calories', () => {
      expect(calculatePCCPoints(0, 0)).toBe(2);
    });
  });

  describe('calculateMealProteinScore', () => {
    it('calculates weighted combination of PAGA and PCC', () => {
      // 35g protein, 400 kcal: PAGA=10, PCC=10
      // (0.625 * 10 + 0.375 * 10) * 1.0 = 10
      const score = calculateMealProteinScore(35, 400, 1.0);
      expect(score).toBe(10);
    });

    it('applies PSQ multiplier', () => {
      // 35g protein, 400 kcal: PAGA=10, PCC=10, base=10
      // With PSQ=0.7 (UPF dominant): 10 * 0.7 = 7
      const scoreWithLowPSQ = calculateMealProteinScore(35, 400, 0.7);
      expect(scoreWithLowPSQ).toBe(7);
    });

    it('clamps result to 10 maximum', () => {
      // Even with perfect inputs and multiplier > 1, should cap at 10
      const score = calculateMealProteinScore(100, 100, 1.0);
      expect(score).toBeLessThanOrEqual(10);
    });

    it('PSQ=0.8 for powder dominant reduces score', () => {
      const wholeScore = calculateMealProteinScore(35, 400, 1.0);
      const powderScore = calculateMealProteinScore(35, 400, 0.8);
      expect(powderScore).toBeLessThan(wholeScore);
      expect(powderScore).toBe(8); // 10 * 0.8
    });

    it('PSQ=0.9 for mixed whole/powder reduces score slightly', () => {
      const wholeScore = calculateMealProteinScore(35, 400, 1.0);
      const mixedScore = calculateMealProteinScore(35, 400, 0.9);
      expect(mixedScore).toBeLessThan(wholeScore);
      expect(mixedScore).toBe(9); // 10 * 0.9
    });
  });

  describe('calculateWFRPoints (Whole Food Ratio)', () => {
    it('returns 10 for >=80% whole food calories', () => {
      expect(calculateWFRPoints(800, 1000)).toBe(10);
      expect(calculateWFRPoints(1000, 1000)).toBe(10);
    });

    it('returns 8 for 70-79%', () => {
      expect(calculateWFRPoints(700, 1000)).toBe(8);
      expect(calculateWFRPoints(790, 1000)).toBe(8);
    });

    it('returns 6 for 60-69%', () => {
      expect(calculateWFRPoints(600, 1000)).toBe(6);
    });

    it('returns 4 for 50-59%', () => {
      expect(calculateWFRPoints(500, 1000)).toBe(4);
    });

    it('returns 2 for <50%', () => {
      expect(calculateWFRPoints(400, 1000)).toBe(2);
    });

    it('returns 5 (neutral) for zero calories', () => {
      expect(calculateWFRPoints(0, 0)).toBe(5);
    });
  });

  describe('calculateFPPoints (Fiber Progress)', () => {
    it('returns 10 for >=30g fiber', () => {
      expect(calculateFPPoints(30)).toBe(10);
      expect(calculateFPPoints(40)).toBe(10);
    });

    it('returns 8 for 25-29g', () => {
      expect(calculateFPPoints(25)).toBe(8);
      expect(calculateFPPoints(29)).toBe(8);
    });

    it('returns 6 for 20-24g', () => {
      expect(calculateFPPoints(20)).toBe(6);
      expect(calculateFPPoints(24)).toBe(6);
    });

    it('returns 4 for 15-19g', () => {
      expect(calculateFPPoints(15)).toBe(4);
      expect(calculateFPPoints(19)).toBe(4);
    });

    it('returns 2 for <15g', () => {
      expect(calculateFPPoints(10)).toBe(2);
      expect(calculateFPPoints(5)).toBe(2);
      expect(calculateFPPoints(0)).toBe(2);
    });
  });

  describe('calculateASPoints (Added Sugar - grams/day)', () => {
    it('returns 10 for <10g added sugar', () => {
      expect(calculateASPoints(0)).toBe(10);
      expect(calculateASPoints(5)).toBe(10);
      expect(calculateASPoints(9)).toBe(10);
    });

    it('returns 8 for 10-19g', () => {
      expect(calculateASPoints(10)).toBe(8);
      expect(calculateASPoints(19)).toBe(8);
    });

    it('returns 6 for 20-29g', () => {
      expect(calculateASPoints(20)).toBe(6);
      expect(calculateASPoints(29)).toBe(6);
    });

    it('returns 4 for 30-39g', () => {
      expect(calculateASPoints(30)).toBe(4);
      expect(calculateASPoints(39)).toBe(4);
    });

    it('returns 2 for 40g+', () => {
      expect(calculateASPoints(40)).toBe(2);
      expect(calculateASPoints(60)).toBe(2);
    });
  });

  describe('calculateMNCPoints (Micronutrient Coverage)', () => {
    it('returns 10 for >=85% coverage', () => {
      expect(calculateMNCPoints(9, 10)).toBe(10); // 90%
      expect(calculateMNCPoints(10, 10)).toBe(10); // 100%
    });

    it('returns 8 for 70-84% coverage', () => {
      expect(calculateMNCPoints(7, 10)).toBe(8); // 70%
      expect(calculateMNCPoints(8, 10)).toBe(8); // 80%
    });

    it('returns 6 for 55-69% coverage', () => {
      expect(calculateMNCPoints(6, 10)).toBe(6); // 60%
    });

    it('returns 4 for 40-54% coverage', () => {
      expect(calculateMNCPoints(4, 10)).toBe(4); // 40%
      expect(calculateMNCPoints(5, 10)).toBe(4); // 50%
    });

    it('returns 2 for <40% coverage', () => {
      expect(calculateMNCPoints(3, 10)).toBe(2); // 30%
    });

    it('returns neutral 5 for zero available nutrients (no data = no penalty)', () => {
      // MNC returns neutral when no micronutrient data is available
      expect(calculateMNCPoints(0, 0)).toBe(5);
    });
  });

  describe('calculatePNDPoints (Phytonutrient Density)', () => {
    it('returns 10 for 6+ plant colors', () => {
      expect(calculatePNDPoints(6)).toBe(10);
      expect(calculatePNDPoints(8)).toBe(10);
    });

    it('returns 8 for 5 colors', () => {
      expect(calculatePNDPoints(5)).toBe(8);
    });

    it('returns 6 for 4 colors', () => {
      expect(calculatePNDPoints(4)).toBe(6);
    });

    it('returns 4 for 3 colors', () => {
      expect(calculatePNDPoints(3)).toBe(4);
    });

    it('returns 2 for 2 colors', () => {
      expect(calculatePNDPoints(2)).toBe(2);
    });

    it('returns 1 for 0-1 colors', () => {
      expect(calculatePNDPoints(1)).toBe(1);
      expect(calculatePNDPoints(0)).toBe(1);
    });
  });

  describe('calculateOBPointsFromRatio (Omega Balance)', () => {
    it('returns 10 for O3:O6 ratio >= 1:4', () => {
      // ratio = 0.25 or better
      expect(calculateOBPointsFromRatio(1, 4)).toBe(10); // 0.25
      expect(calculateOBPointsFromRatio(1, 3)).toBe(10); // 0.33
    });

    it('returns 8 for ratio ~1:6.7', () => {
      expect(calculateOBPointsFromRatio(0.15, 1)).toBe(8); // 0.15
    });

    it('returns 6 for ratio ~1:10', () => {
      expect(calculateOBPointsFromRatio(0.1, 1)).toBe(6); // 0.10
    });

    it('returns 4 for ratio ~1:20', () => {
      expect(calculateOBPointsFromRatio(0.05, 1)).toBe(4); // 0.05
    });

    it('returns 2 for very poor ratio', () => {
      expect(calculateOBPointsFromRatio(0.01, 1)).toBe(2); // 0.01
    });

    it('returns 5 (neutral) for no omega-6 data', () => {
      expect(calculateOBPointsFromRatio(1, 0)).toBe(5);
    });

    it('returns 2 for no omega-3', () => {
      expect(calculateOBPointsFromRatio(0, 10)).toBe(2);
    });
  });

  describe('calculateOBPointsFallback', () => {
    it('returns 10 when fish is present', () => {
      expect(calculateOBPointsFallback(true, 0)).toBe(10);
      expect(calculateOBPointsFallback(true, 5)).toBe(10); // Fish takes priority
    });

    it('returns 8 for 2+ plant omega-3 sources', () => {
      expect(calculateOBPointsFallback(false, 2)).toBe(8);
      expect(calculateOBPointsFallback(false, 5)).toBe(8);
    });

    it('returns 6 for 1 plant omega-3 source', () => {
      expect(calculateOBPointsFallback(false, 1)).toBe(6);
    });

    it('returns 2 for no omega sources', () => {
      expect(calculateOBPointsFallback(false, 0)).toBe(2);
    });
  });

});
