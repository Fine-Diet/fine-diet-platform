/**
 * Tests for ResultsScreen flow-first precedence and legacy fallback
 * 
 * Tests that Flow v2 takes precedence over legacy fields,
 * and that legacy fallback works when Flow v2 is missing.
 */

// Mock the ResultsScreen component's content resolution logic
// This tests the helper functions that determine what content to render

interface FlowPage1 {
  headline: string;
  body: string[];
  snapshotTitle?: string;
  snapshotBullets: string[];
  meaningTitle?: string;
  meaningBody: string;
}

interface FlowPage2 {
  headline?: string;
  stepBullets: string[];
  videoCtaLabel: string;
}

interface FlowPage3 {
  problemHeadline: string;
  problemBody: string[];
  tryTitle: string;
  tryBullets: string[];
  tryCloser: string;
  mechanismTitle: string;
  mechanismBodyTop: string;
  mechanismBodyBottom: string;
  methodTitle: string;
  methodBody: string[];
  methodLearnTitle?: string;
  methodLearnBullets: string[];
  methodCtaLabel: string;
  methodEmailLinkLabel: string;
}

interface ResultsPack {
  label: string;
  summary?: string;
  keyPatterns?: string[];
  firstFocusAreas?: string[];
  methodPositioning?: string;
  flow?: {
    page1?: FlowPage1;
    page2?: FlowPage2;
    page3?: FlowPage3;
  };
}

// Helper functions that mirror the runtime logic
function getPage1Content(pack: ResultsPack) {
  const flow = pack.flow as any;
  const hasFlowV2 = flow && flow.page1 && flow.page1.headline && flow.page1.body && flow.page1.snapshotBullets && flow.page1.meaningBody;

  if (hasFlowV2 && flow.page1) {
    return {
      headline: flow.page1.headline,
      body: flow.page1.body,
      snapshotTitle: flow.page1.snapshotTitle || "What We're Seeing",
      snapshotBullets: flow.page1.snapshotBullets,
      meaningTitle: flow.page1.meaningTitle || "What This Often Means",
      meaningBody: flow.page1.meaningBody,
    };
  }
  // Legacy fallback
  return {
    headline: pack.label,
    body: [pack.summary || ''],
    snapshotTitle: "What We're Seeing",
    snapshotBullets: pack.keyPatterns?.slice(0, 3) || ['', '', ''],
    meaningTitle: "What This Often Means",
    meaningBody: pack.methodPositioning || 'Generic gut advice assumes the same inputs produce the same outcomes for everyone.',
  };
}

function getPage2Content(pack: ResultsPack) {
  const flow = pack.flow as any;
  const hasFlowV2 = flow && flow.page2 && flow.page2.headline && flow.page2.stepBullets && flow.page2.videoCtaLabel;

  if (hasFlowV2 && flow.page2) {
    return {
      headline: flow.page2.headline || 'First Steps',
      stepBullets: flow.page2.stepBullets,
      videoCtaLabel: flow.page2.videoCtaLabel,
    };
  }
  // Legacy fallback
  return {
    headline: 'First Steps',
    stepBullets: pack.firstFocusAreas?.slice(0, 3) || ['', '', ''],
    videoCtaLabel: 'Watch Your Gut Pattern Breakdown',
  };
}

function getPage3Content(pack: ResultsPack) {
  const flow = pack.flow as any;
  const hasFlowV2 = flow && flow.page3 && flow.page3.problemHeadline && flow.page3.problemBody && flow.page3.tryBullets &&
    flow.page3.methodTitle && flow.page3.methodBody && flow.page3.methodLearnBullets &&
    flow.page3.methodCtaLabel && flow.page3.methodEmailLinkLabel;

  if (hasFlowV2 && flow.page3) {
    return {
      problemHeadline: flow.page3.problemHeadline,
      problemBody: flow.page3.problemBody,
      tryTitle: flow.page3.tryTitle,
      tryBullets: flow.page3.tryBullets,
      tryCloser: flow.page3.tryCloser,
      mechanismTitle: flow.page3.mechanismTitle,
      mechanismBodyTop: flow.page3.mechanismBodyTop,
      mechanismBodyBottom: flow.page3.mechanismBodyBottom,
      methodTitle: flow.page3.methodTitle,
      methodBody: flow.page3.methodBody,
      methodLearnTitle: flow.page3.methodLearnTitle || "In the video, you'll learn",
      methodLearnBullets: flow.page3.methodLearnBullets,
      methodCtaLabel: flow.page3.methodCtaLabel,
      methodEmailLinkLabel: flow.page3.methodEmailLinkLabel,
    };
  }
  // Legacy fallback - minimal generic narrative
  return {
    problemHeadline: 'Most gut advice ignores patterns like this.',
    problemBody: ['Generic digestive advice assumes that the same inputs produce the same outcomes for everyone.'],
    tryTitle: 'What most people try',
    tryBullets: ['Trying to fix symptoms instead of understanding signals', 'Chasing consistency through control', 'Interpreting fluctuation as failure'],
    tryCloser: 'This is where many people get stuck.',
    mechanismTitle: 'The Fine Diet Method',
    mechanismBodyTop: 'The Fine Diet Method was built around a different starting point.',
    mechanismBodyBottom: 'Instead of asking, "What should I add or remove?" it begins with, "What pattern is present — and what does it need to stabilize over time?"',
    methodTitle: 'Learn The Fine Diet Method',
    methodBody: ['That distinction matters. And it\'s the foundation for making changes that actually hold.'],
    methodLearnTitle: "In the video, you'll learn",
    methodLearnBullets: ['How to identify your specific gut pattern', 'What your pattern needs to stabilize', 'How to make changes that actually hold'],
    methodCtaLabel: 'Watch How The Fine Diet Method Works',
    methodEmailLinkLabel: 'Email me the link',
  };
}

describe('ResultsScreen Flow-First Precedence', () => {
  describe('Flow v2 takes precedence', () => {
    it('should use Flow v2 page1 content when present', () => {
      const pack: ResultsPack = {
        label: 'Legacy Label',
        summary: 'Legacy Summary',
        keyPatterns: ['Legacy Pattern'],
        flow: {
          page1: {
            headline: 'Flow Headline',
            body: ['Flow paragraph'],
            snapshotBullets: ['Flow bullet 1', 'Flow bullet 2', 'Flow bullet 3'],
            meaningBody: 'Flow meaning',
          },
        },
      };

      const page1 = getPage1Content(pack);
      expect(page1.headline).toBe('Flow Headline');
      expect(page1.body).toEqual(['Flow paragraph']);
      expect(page1.snapshotBullets).toEqual(['Flow bullet 1', 'Flow bullet 2', 'Flow bullet 3']);
      expect(page1.meaningBody).toBe('Flow meaning');
    });

    it('should use Flow v2 page2 content when present', () => {
      const pack: ResultsPack = {
        label: 'Test',
        firstFocusAreas: ['Legacy Area'],
        flow: {
          page2: {
            headline: 'Flow Steps',
            stepBullets: ['Flow step 1', 'Flow step 2', 'Flow step 3'],
            videoCtaLabel: 'Flow Video CTA',
          },
        },
      };

      const page2 = getPage2Content(pack);
      expect(page2.headline).toBe('Flow Steps');
      expect(page2.stepBullets).toEqual(['Flow step 1', 'Flow step 2', 'Flow step 3']);
      expect(page2.videoCtaLabel).toBe('Flow Video CTA');
    });

    it('should use Flow v2 page3 content when present', () => {
      const pack: ResultsPack = {
        label: 'Test',
        flow: {
          page3: {
            problemHeadline: 'Flow Problem',
            problemBody: ['Flow problem paragraph'],
            tryTitle: 'Flow Try',
            tryBullets: ['Try 1', 'Try 2', 'Try 3'],
            tryCloser: 'Flow closer',
            mechanismTitle: 'Flow Mechanism',
            mechanismBodyTop: 'Flow top',
            mechanismBodyBottom: 'Flow bottom',
            methodTitle: 'Flow Method',
            methodBody: ['Flow method paragraph'],
            methodLearnBullets: ['Learn 1', 'Learn 2', 'Learn 3'],
            methodCtaLabel: 'Flow CTA',
            methodEmailLinkLabel: 'Flow Email',
          },
        },
      };

      const page3 = getPage3Content(pack);
      expect(page3.problemHeadline).toBe('Flow Problem');
      expect(page3.methodCtaLabel).toBe('Flow CTA');
      expect(page3.methodEmailLinkLabel).toBe('Flow Email');
    });
  });

  describe('Legacy fallback', () => {
    it('should fallback to legacy fields when Flow v2 is missing', () => {
      const pack: ResultsPack = {
        label: 'Legacy Label',
        summary: 'Legacy Summary',
        keyPatterns: ['Pattern 1', 'Pattern 2', 'Pattern 3', 'Pattern 4'],
        firstFocusAreas: ['Area 1', 'Area 2', 'Area 3'],
        methodPositioning: 'Legacy Positioning',
      };

      const page1 = getPage1Content(pack);
      expect(page1.headline).toBe('Legacy Label');
      expect(page1.body).toEqual(['Legacy Summary']);
      expect(page1.snapshotBullets).toEqual(['Pattern 1', 'Pattern 2', 'Pattern 3']); // First 3
      expect(page1.meaningBody).toBe('Legacy Positioning');

      const page2 = getPage2Content(pack);
      expect(page2.headline).toBe('First Steps');
      expect(page2.stepBullets).toEqual(['Area 1', 'Area 2', 'Area 3']); // First 3
      expect(page2.videoCtaLabel).toBe('Watch Your Gut Pattern Breakdown');
    });

    it('should fallback to legacy when Flow v2 is incomplete', () => {
      const pack: ResultsPack = {
        label: 'Legacy Label',
        summary: 'Legacy Summary',
        keyPatterns: ['Pattern 1', 'Pattern 2', 'Pattern 3'],
        firstFocusAreas: ['Area 1', 'Area 2', 'Area 3'],
        flow: {
          page1: {
            headline: 'Flow Headline',
            // Missing required fields - should fallback
          },
        },
      };

      const page1 = getPage1Content(pack);
      // Should use legacy because Flow is incomplete
      expect(page1.headline).toBe('Legacy Label');
      expect(page1.body).toEqual(['Legacy Summary']);
    });

    it('should use generic fallback for page3 when legacy fields missing', () => {
      const pack: ResultsPack = {
        label: 'Test',
        summary: 'Test',
        keyPatterns: ['Test'],
        firstFocusAreas: ['Test'],
        // No flow, minimal legacy
      };

      const page3 = getPage3Content(pack);
      expect(page3.problemHeadline).toBe('Most gut advice ignores patterns like this.');
      expect(page3.methodCtaLabel).toBe('Watch How The Fine Diet Method Works');
      expect(page3.methodEmailLinkLabel).toBe('Email me the link');
    });
  });

  describe('Default values', () => {
    it('should use defaults for optional Flow v2 fields', () => {
      const pack: ResultsPack = {
        label: 'Test',
        flow: {
          page1: {
            headline: 'Test',
            body: ['Test'],
            snapshotBullets: ['1', '2', '3'],
            meaningBody: 'Test',
            // snapshotTitle and meaningTitle missing - should use defaults
          },
        },
      };

      const page1 = getPage1Content(pack);
      expect(page1.snapshotTitle).toBe("What We're Seeing");
      expect(page1.meaningTitle).toBe("What This Often Means");
    });

    it('should use defaults for page2 headline when missing', () => {
      const pack: ResultsPack = {
        label: 'Test',
        flow: {
          page2: {
            stepBullets: ['1', '2', '3'],
            videoCtaLabel: 'Test',
            // headline missing
          },
        },
      };

      const page2 = getPage2Content(pack);
      expect(page2.headline).toBe('First Steps');
    });
  });
});

