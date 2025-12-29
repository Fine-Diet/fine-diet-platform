/**
 * Build Assessment Index
 * 
 * Helper to merge question sets and results packs into unified assessment rows.
 */

export interface AssessmentVersion {
  assessmentType: string;
  assessmentVersion: string;
  locale: string | null;
  questionSetId: string | null;
  resultsPackIds: {
    level1: string | null;
    level2: string | null;
    level3: string | null;
    level4: string | null;
  };
}

interface QuestionSetItem {
  id: string;
  assessmentType: string;
  assessmentVersion: string;
  locale: string | null;
}

interface ResultsPackItem {
  id: string;
  assessmentType: string;
  resultsVersion: string;
  levelId: string;
}

/**
 * Merge question sets and results packs into unified assessment rows
 */
export function buildAssessmentIndex(
  questionSets: QuestionSetItem[],
  resultsPacks: ResultsPackItem[]
): AssessmentVersion[] {
  const versionMap = new Map<string, AssessmentVersion>();

  // Add question sets
  questionSets.forEach((qs) => {
    const key = `${qs.assessmentType}:${qs.assessmentVersion}:${qs.locale || 'null'}`;
    if (!versionMap.has(key)) {
      versionMap.set(key, {
        assessmentType: qs.assessmentType,
        assessmentVersion: qs.assessmentVersion,
        locale: qs.locale,
        questionSetId: qs.id,
        resultsPackIds: {
          level1: null,
          level2: null,
          level3: null,
          level4: null,
        },
      });
    } else {
      versionMap.get(key)!.questionSetId = qs.id;
    }
  });

  // Add results packs
  resultsPacks.forEach((rp) => {
    // Results packs don't have locale, so use null for key matching
    // Match by assessmentType and resultsVersion
    const key = `${rp.assessmentType}:${rp.resultsVersion}:null`;
    
    if (!versionMap.has(key)) {
      versionMap.set(key, {
        assessmentType: rp.assessmentType,
        assessmentVersion: rp.resultsVersion,
        locale: null,
        questionSetId: null,
        resultsPackIds: {
          level1: null,
          level2: null,
          level3: null,
          level4: null,
        },
      });
    }
    
    const version = versionMap.get(key)!;
    if (rp.levelId === 'level1') version.resultsPackIds.level1 = rp.id;
    if (rp.levelId === 'level2') version.resultsPackIds.level2 = rp.id;
    if (rp.levelId === 'level3') version.resultsPackIds.level3 = rp.id;
    if (rp.levelId === 'level4') version.resultsPackIds.level4 = rp.id;
  });

  // Convert to array and sort
  const assessmentsArray = Array.from(versionMap.values()).sort((a, b) => {
    if (a.assessmentType !== b.assessmentType) {
      return a.assessmentType.localeCompare(b.assessmentType);
    }
    if (a.assessmentVersion !== b.assessmentVersion) {
      // Compare versions numerically if they're numbers, otherwise as strings
      const aNum = Number(a.assessmentVersion);
      const bNum = Number(b.assessmentVersion);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.assessmentVersion.localeCompare(b.assessmentVersion);
    }
    return (a.locale || '').localeCompare(b.locale || '');
  });

  return assessmentsArray;
}

