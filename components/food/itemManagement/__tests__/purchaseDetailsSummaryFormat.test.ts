import { formatPurchaseDetailsSummary } from '../purchaseDetailsSummaryFormat';

describe('formatPurchaseDetailsSummary', () => {
  it('formats package, retailer, and price compactly', () => {
    const summary = formatPurchaseDetailsSummary({
      productTitle: 'Organic kale',
      brandName: '365',
      packageSize: '5',
      packageUnit: 'oz',
      packageCount: '1',
      retailer: 'Whole Foods Market',
      priceAmount: '3.49',
      currency: 'USD',
    });
    expect(summary.productTitle).toBe('Organic kale');
    expect(summary.brandLine).toBe('365');
    expect(summary.packageRetailerLine).toBe('5 oz × 1 · Whole Foods Market');
    expect(summary.priceLine).toContain('3.49');
  });

  it('omits brand when already obvious from title', () => {
    const summary = formatPurchaseDetailsSummary({
      productTitle: 'Chobani Greek Yogurt',
      brandName: 'Chobani',
      packageSize: '',
      packageUnit: '',
      packageCount: '',
      retailer: '',
      priceAmount: '',
      currency: 'USD',
    });
    expect(summary.brandLine).toBeNull();
  });
});
