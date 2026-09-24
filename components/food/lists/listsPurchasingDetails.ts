import type { PurchaseDetailsSummaryInput } from '@/components/food/itemManagement/purchaseDetailsSummaryFormat';
import type {
  GroceryListPriceObservation,
  GroceryListPurchasingChoice,
} from '@/lib/plans/types';

export function listsPurchasingSummaryInput(
  choice: GroceryListPurchasingChoice | undefined,
  price: GroceryListPriceObservation | undefined,
): PurchaseDetailsSummaryInput {
  return {
    productTitle:
      choice?.shopping_display_name?.trim()
      || choice?.preferred_product?.trim()
      || price?.product_title?.trim()
      || '',
    brandName: price?.brand_name?.trim() || '',
    packageSize:
      price?.package_size != null ? String(price.package_size) : '',
    packageUnit: price?.package_unit?.trim() || '',
    packageCount:
      price?.package_count != null ? String(price.package_count) : '',
    retailer: price?.retailer?.trim() || '',
    priceAmount:
      price?.line_total != null ? String(price.line_total) : '',
    currency: price?.currency?.trim() || 'USD',
  };
}

export function listsPurchasingHasChoice(
  choice: GroceryListPurchasingChoice | undefined,
  price: GroceryListPriceObservation | undefined,
): boolean {
  return Boolean(
    choice?.shopping_display_name?.trim()
    || choice?.preferred_product?.trim()
    || price?.product_title?.trim(),
  );
}
