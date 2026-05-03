import type { SocialImportReviewItem } from './types';

export function currentAcquisitionReviewItems(args: {
  previousReviewItems: SocialImportReviewItem[];
  acquisitionReviewItems: SocialImportReviewItem[];
  replaceEvidence: boolean;
}): SocialImportReviewItem[] {
  return mergeReviewItems(
    args.replaceEvidence ? [] : args.previousReviewItems,
    args.acquisitionReviewItems,
  );
}

export function latestExtractionReviewItems(
  reviewItems: SocialImportReviewItem[],
): SocialImportReviewItem[] {
  return mergeReviewItems(reviewItems);
}

export function mergeReviewItems(
  ...groups: Array<SocialImportReviewItem[] | null | undefined>
): SocialImportReviewItem[] {
  const merged = new Map<string, SocialImportReviewItem>();
  for (const group of groups) {
    for (const item of group ?? []) {
      const key = [
        item.code,
        item.severity,
        item.message.trim().toLowerCase(),
        item.evidence_refs
          .map((ref) => `${ref.evidence_source_id}:${ref.quote ?? ''}`)
          .sort()
          .join('|'),
      ].join('::');
      if (!merged.has(key)) merged.set(key, item);
    }
  }
  return Array.from(merged.values());
}
