export const RAW_MATERIAL_UNITS = ['g', 'kg', 'ml', 'ltr', 'pcs'] as const;
export type RawMaterialUnit = (typeof RAW_MATERIAL_UNITS)[number];

export function isRestaurantBusiness(businessType?: string | null): boolean {
  return businessType === 'restaurant';
}

export function isRestaurantWaiter(role?: string | null, businessType?: string | null): boolean {
  return role === 'waiter' && businessType === 'restaurant';
}

export function validateRawMaterialName(name: string): string | null {
  if (!name.trim()) return 'Material name is required.';
  return null;
}

export function parseOpeningStock(input: string): { ok: true; value: number } | { ok: false; message: string } {
  if (!input.trim()) return { ok: true, value: 0 };
  const value = parseFloat(input);
  if (Number.isNaN(value) || value < 0) {
    return { ok: false, message: 'Enter a valid opening stock (0 or more).' };
  }
  return { ok: true, value };
}

export function normalizeRawMaterialUnit(unit: string): RawMaterialUnit {
  return RAW_MATERIAL_UNITS.includes(unit as RawMaterialUnit) ? (unit as RawMaterialUnit) : 'g';
}

export function buildRawMaterialInsertPayload(params: {
  businessId: string;
  name: string;
  unit: string;
  stockQuantity: number;
}) {
  return {
    business_id: params.businessId,
    name: params.name.trim(),
    unit: params.unit.trim(),
    stock_quantity: params.stockQuantity,
  };
}
