/**
 * Build Assessment Index
 * 
 * Helper to merge question sets and results packs into unified assessment rows.
 */

export interface AssessmentVersion {
  assessmentType: string;
  questionsVersion: number; // Integer for question_sets.assessment_version
  resultsVersion: string; // String for results_packs.results_version (e.g., 'v2', '2')
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
  assessmentVersion: string | number; // API returns number from DB
  locale: string | null;
}

interface ResultsPackItem {
  id: string;
  assessmentType: string;
  resultsVersion: string; // API returns string from DB
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
    // Parse assessmentVersion to number (questions use integer)
    const questionsVersion = typeof qs.assessmentVersion === 'number' 
      ? qs.assessmentVersion 
      : parseInt(String(qs.assessmentVersion), 10);
    
    if (isNaN(questionsVersion)) {
      console.warn(`Invalid questions version for ${qs.assessmentType}: ${qs.assessmentVersion}`);
      return; // Skip invalid entries
    }

    const key = `${qs.assessmentType}:${questionsVersion}:${qs.locale || 'null'}`;
    if (!versionMap.has(key)) {
      versionMap.set(key, {
        assessmentType: qs.assessmentType,
        questionsVersion,
        resultsVersion: String(questionsVersion), // Default to same as questions version
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
      versionMap.get(key)!.questionsVersion = questionsVersion;
    }
  });

  // Add results packs
  resultsPacks.forEach((rp) => {
    // Results packs use string version (e.g., 'v2', '2')
    const resultsVersion = String(rp.resultsVersion);
    
    // Try to match with existing question set by converting resultsVersion to number
    // If resultsVersion is 'v2', try to match with questionsVersion 2
    const resultsVersionNum = resultsVersion.startsWith('v') 
      ? parseInt(resultsVersion.slice(1), 10)
      : parseInt(resultsVersion, 10);
    
    // Try to find existing row by matching assessmentType and numeric version
    let matchedKey: string | null = null;
    if (!isNaN(resultsVersionNum)) {
      const entries = Array.from(versionMap.entries());
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];
        if (value.assessmentType === rp.assessmentType && 
            value.questionsVersion === resultsVersionNum) {
          matchedKey = key;
          break;
        }
      }
    }
    
    if (matchedKey) {
      // Update existing row with resultsVersion and pack IDs
      const version = versionMap.get(matchedKey)!;
      version.resultsVersion = resultsVersion;
      if (rp.levelId === 'level1') version.resultsPackIds.level1 = rp.id;
      if (rp.levelId === 'level2') version.resultsPackIds.level2 = rp.id;
      if (rp.levelId === 'level3') version.resultsPackIds.level3 = rp.id;
      if (rp.levelId === 'level4') version.resultsPackIds.level4 = rp.id;
    } else {
      // Create new row for results-only entry
      const key = `${rp.assessmentType}:${resultsVersionNum || resultsVersion}:null`;
      if (!versionMap.has(key)) {
        versionMap.set(key, {
          assessmentType: rp.assessmentType,
          questionsVersion: resultsVersionNum || 0, // Default to 0 if can't parse
          resultsVersion: resultsVersion,
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
    }
  });

  // Convert to array and sort
  const assessmentsArray = Array.from(versionMap.values()).sort((a, b) => {
    if (a.assessmentType !== b.assessmentType) {
      return a.assessmentType.localeCompare(b.assessmentType);
    }
    // Sort by questionsVersion (numeric)
    if (a.questionsVersion !== b.questionsVersion) {
      return a.questionsVersion - b.questionsVersion;
    }
    return (a.locale || '').localeCompare(b.locale || '');
  });

  return assessmentsArray;
}

