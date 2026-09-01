import { describe, expect, it } from '@jest/globals';

import {
  buildRawMaterialInsertPayload,
  isRestaurantBusiness,
  isRestaurantWaiter,
  normalizeRawMaterialUnit,
  parseOpeningStock,
  RAW_MATERIAL_UNITS,
  validateRawMaterialName,
} from '@/lib/restaurantHelpers';

describe('restaurantHelpers', () => {
  it('detects restaurant business', () => {
    expect(isRestaurantBusiness('restaurant')).toBe(true);
    expect(isRestaurantBusiness('retail')).toBe(false);
  });

  it('detects restaurant waiter', () => {
    expect(isRestaurantWaiter('waiter', 'restaurant')).toBe(true);
    expect(isRestaurantWaiter('owner', 'restaurant')).toBe(false);
  });

  it('validates raw material name', () => {
    expect(validateRawMaterialName('Paneer')).toBeNull();
    expect(validateRawMaterialName('')).not.toBeNull();
  });

  it('parses opening stock', () => {
    expect(parseOpeningStock('10')).toEqual({ ok: true, value: 10 });
    expect(parseOpeningStock('').ok).toBe(true);
  });

  it('normalizes units', () => {
    expect(normalizeRawMaterialUnit('ltr')).toBe('ltr');
    expect(normalizeRawMaterialUnit('cup')).toBe('g');
    expect(RAW_MATERIAL_UNITS).toHaveLength(5);
  });

  it('builds insert payload', () => {
    expect(
      buildRawMaterialInsertPayload({
        businessId: 'b1',
        name: 'Masala',
        unit: 'g',
        stockQuantity: 0,
      }).name,
    ).toBe('Masala');
  });
});
