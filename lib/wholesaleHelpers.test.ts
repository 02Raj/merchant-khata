import { describe, expect, it } from '@jest/globals';

import {
  buildCartLineId,
  customerTypeLabel,
  isHybridShop,
  mergeCartLines,
  normalizeCustomerType,
  resolveCartUnitPrice,
  resolveDefaultPricingMode,
  resolvePricingModeFromCustomer,
  resolveNewCustomerType,
  shouldShowPricingToggle,
  toggleCartLineRate,
  validateWholesaleProductFields,
  validateWholesaleShopProduct,
  walkInCustomerLabel,
} from '@/lib/wholesaleHelpers';

describe('wholesaleHelpers', () => {
  it('normalizes legacy cash/credit customer types', () => {
    expect(normalizeCustomerType('cash')).toBe('retail');
    expect(normalizeCustomerType('credit')).toBe('wholesale');
    expect(normalizeCustomerType('wholesale')).toBe('wholesale');
  });

  it('defaults wholesale shop to wholesale pricing', () => {
    expect(resolveDefaultPricingMode('wholesale')).toBe('wholesale');
    expect(resolveDefaultPricingMode('retail')).toBe('retail');
  });

  it('shows pricing toggle for wholesale and hybrid', () => {
    expect(shouldShowPricingToggle('wholesale')).toBe(true);
    expect(shouldShowPricingToggle('both')).toBe(true);
    expect(shouldShowPricingToggle('retail')).toBe(false);
  });

  it('uses wholesale price when available', () => {
    const result = resolveCartUnitPrice('wholesale', { sale_price: 100, wholesale_price: 85 });
    expect(result).toEqual({ price: 85, isWholesaleRate: true });
  });

  it('falls back to retail price when wholesale price missing', () => {
    const result = resolveCartUnitPrice('wholesale', { sale_price: 100, wholesale_price: null });
    expect(result).toEqual({ price: 100, isWholesaleRate: false });
  });

  it('requires wholesale price when MOQ is set', () => {
    expect(validateWholesaleProductFields({ wholesalePrice: null, moq: 10 })).toContain('Wholesale price');
  });

  it('builds unique line ids for retail vs wholesale', () => {
    expect(buildCartLineId('p1', false, 'base')).not.toBe(buildCartLineId('p1', true, 'base'));
  });

  it('toggles line between retail and wholesale rate', () => {
    const line = {
      lineId: buildCartLineId('p1', false, 'base'),
      product: { id: 'p1', sale_price: 100, wholesale_price: 80 },
      unit_price: 100,
      is_wholesale_rate: false,
      selected_unit: 'base' as const,
      quantity: 2,
    };
    const { item, error } = toggleCartLineRate(line);
    expect(error).toBeNull();
    expect(item.is_wholesale_rate).toBe(true);
    expect(item.unit_price).toBe(80);
  });

  it('merges duplicate cart lines with same line id', () => {
    const merged = mergeCartLines(
      [{ lineId: 'a', quantity: 2 }],
      { lineId: 'a', quantity: 3 },
    );
    expect(merged).toEqual([{ lineId: 'a', quantity: 5 }]);
  });

  it('requires wholesale price on wholesale-only shops', () => {
    expect(validateWholesaleShopProduct('wholesale', null)).toContain('required');
    expect(validateWholesaleShopProduct('both', null)).toBeNull();
  });

  it('resolves customer type from business type', () => {
    expect(resolveNewCustomerType('wholesale', 'retail')).toBe('wholesale');
    expect(resolveNewCustomerType('both', 'retail')).toBe('retail');
    expect(resolveNewCustomerType('retail', 'wholesale')).toBe('retail');
  });

  it('identifies hybrid shops', () => {
    expect(isHybridShop('both')).toBe(true);
    expect(isHybridShop('retail')).toBe(false);
  });

  it('walk-in label varies by business type', () => {
    expect(walkInCustomerLabel('both')).toBe('Walk-in (Retail)');
    expect(walkInCustomerLabel('wholesale')).toBe('Walk-in (Wholesale)');
  });
});
