import { describe, expect, it } from '@jest/globals';

import {
  buildRawMaterialInsertPayload,
  formatOpenOrderAge,
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

  it('formats live order age for quick floor scanning', () => {
    const now = new Date('2026-09-28T12:00:00.000Z').getTime();
    expect(formatOpenOrderAge('2026-09-28T11:42:00.000Z', now)).toBe('18m');
    expect(formatOpenOrderAge('2026-09-28T10:35:00.000Z', now)).toBe('1h 25m');
    expect(formatOpenOrderAge(null, now)).toBe('');
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
