import { describe, expect, it } from '@jest/globals';

import { getStockViolations, getMoqViolations, getEffectiveCartQuantity } from '@/lib/salesValidation';

describe('getStockViolations', () => {
  it('flags items that exceed available stock', () => {
    const violations = getStockViolations([
      {
        product: { id: '1', name: 'Salt', stockCount: 2, conversion_factor: null },
        quantity: 5,
        selected_unit: 'base',
      },
    ]);

    expect(violations).toEqual(['Salt: only 2 in stock, bill needs 5']);
  });

  it('sums quantities for duplicate cart lines', () => {
    const violations = getStockViolations([
      {
        product: { id: '1', name: 'Salt', stockCount: 3, conversion_factor: null },
        quantity: 2,
        selected_unit: 'base',
      },
      {
        product: { id: '1', name: 'Salt', stockCount: 3, conversion_factor: null },
        quantity: 2,
        selected_unit: 'base',
      },
    ]);

    expect(violations.length).toBe(1);
  });

  it('returns empty when stock is sufficient', () => {
    const violations = getStockViolations([
      {
        product: { id: '1', name: 'Salt', stockCount: 24, conversion_factor: 12 },
        quantity: 1,
        selected_unit: 'alternate',
      },
    ]);

    expect(violations).toEqual([]);
    expect(getEffectiveCartQuantity({
      product: { id: '1', name: 'Salt', stockCount: 24, conversion_factor: 12 },
      quantity: 1,
      selected_unit: 'alternate',
    })).toBe(12);
  });
});

describe('getMoqViolations', () => {
  it('flags wholesale lines below MOQ', () => {
    const violations = getMoqViolations([
      {
        product: { id: '1', name: 'Dal', stockCount: 50, conversion_factor: null, moq: 10 },
        quantity: 5,
        selected_unit: 'base',
        is_wholesale_rate: true,
      },
    ]);
    expect(violations).toHaveLength(1);
  });
});
