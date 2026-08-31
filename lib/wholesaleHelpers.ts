export type NormalizedCustomerType = 'retail' | 'wholesale';
export type PricingMode = NormalizedCustomerType;

/** Maps legacy DB values (cash/credit) to modern retail/wholesale types. */
export function normalizeCustomerType(
  customerType: string | null | undefined,
): NormalizedCustomerType {
  if (customerType === 'wholesale' || customerType === 'credit') return 'wholesale';
  return 'retail';
}

export function resolvePricingModeFromCustomer(customerType: string | null | undefined): PricingMode {
  return normalizeCustomerType(customerType);
}

export function isHybridShop(businessType: string | undefined): boolean {
  return businessType === 'both';
}

export function shouldShowPricingToggle(businessType: string | undefined): boolean {
  return isHybridShop(businessType) || businessType === 'wholesale';
}

export function walkInCustomerLabel(businessType: string | undefined): string {
  if (businessType === 'wholesale') return 'Walk-in (Wholesale)';
  return 'Walk-in (Retail)';
}

export function resolveDefaultPricingMode(businessType: string | undefined): PricingMode {
  return businessType === 'wholesale' ? 'wholesale' : 'retail';
}

export function getWholesaleUnitPrice(product: {
  sale_price: number;
  wholesale_price: number | null;
}): { price: number; isWholesaleRate: boolean } | null {
  if (product.wholesale_price == null) return null;
  return { price: product.wholesale_price, isWholesaleRate: true };
}

export function resolveCartUnitPrice(
  pricingMode: PricingMode,
  product: { sale_price: number; wholesale_price: number | null },
): { price: number; isWholesaleRate: boolean } {
  if (pricingMode === 'wholesale') {
    const wholesale = getWholesaleUnitPrice(product);
    if (wholesale) return wholesale;
  }
  return { price: product.sale_price, isWholesaleRate: false };
}

export function validateWholesaleProductFields(params: {
  wholesalePrice: number | null;
  moq: number | null;
}): string | null {
  if (params.moq != null && params.moq > 0 && params.wholesalePrice == null) {
    return 'Wholesale price is required when MOQ is set.';
  }
  if (params.wholesalePrice != null && params.wholesalePrice < 0) {
    return 'Wholesale price must be a positive number.';
  }
  if (params.moq != null && params.moq <= 0) {
    return 'MOQ must be a positive number greater than 0.';
  }
  return null;
}

export function customerTypeLabel(customerType: string | null | undefined): string {
  return normalizeCustomerType(customerType) === 'wholesale' ? 'Wholesale' : 'Retail';
}

export function resolveNewCustomerType(
  businessType: string | undefined,
  selectedType: 'retail' | 'wholesale',
): NormalizedCustomerType {
  if (businessType === 'both') return selectedType;
  if (businessType === 'wholesale') return 'wholesale';
  return 'retail';
}

export function validateWholesaleShopProduct(
  businessType: string | undefined,
  wholesalePrice: number | null,
): string | null {
  if (businessType === 'wholesale' && (wholesalePrice == null || wholesalePrice <= 0)) {
    return 'Wholesale price is required for wholesale shops.';
  }
  return null;
}

export function buildCartLineId(
  productId: string,
  isWholesaleRate: boolean,
  selectedUnit: 'base' | 'alternate',
): string {
  return `${productId}:${isWholesaleRate ? 'ws' : 'rt'}:${selectedUnit}`;
}

export function toggleCartLineRate<T extends {
  lineId: string;
  product: { id: string; sale_price: number; wholesale_price: number | null };
  unit_price: number;
  is_wholesale_rate: boolean;
  selected_unit: 'base' | 'alternate';
  quantity: number | string;
}>(item: T): { item: T; error: string | null } {
  const nextIsWholesale = !item.is_wholesale_rate;
  if (nextIsWholesale && item.product.wholesale_price == null) {
    return { item, error: 'Wholesale price is not set for this product.' };
  }

  const pricingMode: PricingMode = nextIsWholesale ? 'wholesale' : 'retail';
  const { price, isWholesaleRate } = resolveCartUnitPrice(pricingMode, item.product);
  const lineId = buildCartLineId(item.product.id, isWholesaleRate, item.selected_unit);

  return {
    item: {
      ...item,
      lineId,
      unit_price: price,
      is_wholesale_rate: isWholesaleRate,
    },
    error: null,
  };
}

export function mergeCartLines<T extends { lineId: string; quantity: number | string }>(
  cart: T[],
  incoming: T,
): T[] {
  const duplicate = cart.find((line) => line.lineId === incoming.lineId);
  if (!duplicate) {
    return [...cart, incoming];
  }

  return cart.map((line) =>
    line.lineId === incoming.lineId
      ? { ...line, quantity: Number(line.quantity) + Number(incoming.quantity) }
      : line,
  );
}
