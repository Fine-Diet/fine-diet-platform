import { describe, expect, it } from '@jest/globals';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { parseStrictContributorHaulAppPath } from '../haulContributorAppRoutes';

const HAUL_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('parseStrictContributorHaulAppPath', () => {
  it('matches haul detail and shop only', () => {
    expect(parseStrictContributorHaulAppPath(`${APP_ROUTES.foodHauls}/${HAUL_ID}`)).toEqual({
      haulId: HAUL_ID,
    });
    expect(
      parseStrictContributorHaulAppPath(`${APP_ROUTES.foodHauls}/${HAUL_ID}/shop`),
    ).toEqual({ haulId: HAUL_ID });
    expect(
      parseStrictContributorHaulAppPath(`${APP_ROUTES.foodHauls}/${HAUL_ID}?prepare=1`),
    ).toEqual({ haulId: HAUL_ID });
  });

  it('rejects haul library and unrelated app paths', () => {
    expect(parseStrictContributorHaulAppPath(APP_ROUTES.foodHauls)).toBeNull();
    expect(parseStrictContributorHaulAppPath(`${APP_ROUTES.foodHauls}/`)).toBeNull();
    expect(parseStrictContributorHaulAppPath(APP_ROUTES.food)).toBeNull();
    expect(parseStrictContributorHaulAppPath(APP_ROUTES.log)).toBeNull();
    expect(parseStrictContributorHaulAppPath(`${APP_ROUTES.foodHauls}/not-a-uuid`)).toBeNull();
    expect(
      parseStrictContributorHaulAppPath(`${APP_ROUTES.foodHauls}/${HAUL_ID}/extra`),
    ).toBeNull();
    expect(
      parseStrictContributorHaulAppPath(`${APP_ROUTES.foodHauls}/${HAUL_ID}/shop/more`),
    ).toBeNull();
  });
});
