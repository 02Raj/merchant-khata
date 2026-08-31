export type CartLineForStock = {
  product: {
    id: string;
    name: string;
    stockCount: number;
    conversion_factor: number | null;
    moq?: number | null;
  };
  quantity: number | string;
  selected_unit: 'base' | 'alternate';
  is_wholesale_rate?: boolean;
};

export function getEffectiveCartQuantity(item: CartLineForStock): number {
  const parsedQty = Number(item.quantity) || 0;
  const isAlt = item.selected_unit === 'alternate' && item.product.conversion_factor;
  return isAlt ? parsedQty * item.product.conversion_factor! : parsedQty;
}

export function getStockViolations(items: CartLineForStock[]): string[] {
  const required = new Map<string, { name: string; qty: number; stock: number }>();

  for (const item of items) {
    const qty = getEffectiveCartQuantity(item);
    const existing = required.get(item.product.id);
    if (existing) {
      existing.qty += qty;
    } else {
      required.set(item.product.id, {
        name: item.product.name,
        qty,
        stock: item.product.stockCount,
      });
    }
  }

  const violations: string[] = [];
  for (const { name, qty, stock } of required.values()) {
    if (qty > stock) {
      violations.push(`${name}: only ${stock} in stock, bill needs ${qty}`);
    }
  }
  return violations;
}

export function getMoqViolations(items: CartLineForStock[]): string[] {
  const violations: string[] = [];
  for (const item of items) {
    if (!item.is_wholesale_rate) continue;
    const moq = item.product.moq ?? 1;
    const qty = getEffectiveCartQuantity(item);
    if (qty < moq) {
      violations.push(`${item.product.name}: minimum qty is ${moq}`);
    }
  }
  return violations;
}

export function filterProductsForPos<T extends { is_active?: boolean; name: string; barcode?: string | null }>(
  products: T[],
  query: string,
  showInactive = false,
): T[] {
  const lower = query.toLowerCase().trim();
  return products.filter((product) => {
    if (!showInactive && product.is_active === false) return false;
    if (!lower) return true;
    return (
      product.name.toLowerCase().includes(lower) ||
      (product.barcode && product.barcode.toLowerCase().includes(lower))
    );
  });
}

export function shouldBlockCreditWithoutCustomer(paymentType: string, hasCustomer: boolean): boolean {
  return paymentType === 'credit' && !hasCustomer;
}
