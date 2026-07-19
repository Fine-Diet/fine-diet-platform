import { shouldApplySerializedSaveResult } from '@/lib/plans/serializedReusableSave';

describe('serializedReusableSave', () => {
  test('applies only the latest save generation', () => {
    expect(shouldApplySerializedSaveResult(1, 1)).toBe(true);
    expect(shouldApplySerializedSaveResult(1, 2)).toBe(false);
  });
});
