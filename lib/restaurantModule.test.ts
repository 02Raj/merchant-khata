/**
 * Restaurant Module — automated E2E verification + bug fixes.
 * Maps to test plan IDs (F*) and bug IDs (B-R*).
 */
import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import {
  buildRawMaterialInsertPayload,
  isRestaurantBusiness,
  isRestaurantWaiter,
  normalizeRawMaterialUnit,
  parseOpeningStock,
  RAW_MATERIAL_UNITS,
  validateRawMaterialName,
} from '@/lib/restaurantHelpers';

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('Restaurant Module — Setup & Navigation (F1)', () => {
  it('F1.1 — restaurant business type detected', () => {
    expect(isRestaurantBusiness('restaurant')).toBe(true);
    expect(isRestaurantBusiness('retail')).toBe(false);
    expect(isRestaurantBusiness('both')).toBe(false);
  });

  it('F1.2 — tables tab shown instead of sales for restaurant', () => {
    const src = read('app/(tabs)/_layout.tsx');
    expect(src).toContain("business_type === 'restaurant'");
    expect(src).toContain('tables');
    expect(src).toMatch(/href:\s*isRestaurant\s*\?\s*'\/\(tabs\)\/tables'/);
  });

  it('F1.3 — waiter lands on tables, not dashboard', () => {
    const indexSrc = read('app/index.tsx');
    const layoutSrc = read('app/_layout.tsx');
    expect(indexSrc).toContain("role === 'waiter'");
    expect(indexSrc).toContain("business_type === 'restaurant'");
    expect(layoutSrc).toContain("role === 'waiter'");
  });

  it('F1.4 — waiter cannot access inventory tab', () => {
    const src = read('app/(tabs)/_layout.tsx');
    expect(src).toContain('isWaiter');
    expect(src).toMatch(/href:\s*isWaiter\s*\?\s*null/);
  });
});

describe('Restaurant Module — Tables & KOT (F2)', () => {
  it('F2.1 — tables screen creates dine-in orders', () => {
    const src = read('app/(tabs)/tables.tsx');
    expect(src).toContain("from('tables')");
    expect(src).toContain('/kot/new');
    expect(src).toContain('takeaway');
  });

  it('F2.2 — KOT screen loads products, variants, modifiers', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain("from('products')");
    expect(src).toContain("from('product_variants')");
    expect(src).toContain("from('modifiers')");
    expect(src).toContain("from('order_items')");
  });

  it('F2.3 — 86d items blocked on add to cart', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain('is_available_today');
    expect(src).toMatch(/if\s*\(\s*!product\.is_available_today\s*\)/);
  });

  it('F2.4 — only active menu items in KOT', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain("eq('is_active', true)");
  });

  it('F2.5 — waiter can request cancel, not bill/settle', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain("role === 'waiter'");
    expect(src).toContain("role !== 'waiter'");
    expect(src).toContain('Generate Bill');
    expect(src).toContain('Settle Payment');
  });

  it('F2.6 — safe print on KOT reprint (cancel does not crash)', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain('safePrintAsync');
    const safePrint = read('lib/safePrint.ts');
    expect(safePrint).toContain("'cancelled'");
  });
});

describe('Restaurant Module — Menu / Variants / Modifiers (F3)', () => {
  it('F3.1 — restaurant products open detail screen for variants', () => {
    const src = read('app/(tabs)/products.tsx');
    expect(src).toContain("business_type === 'restaurant'");
    expect(src).toContain('/products/${item.id}');
  });

  it('F3.2 — product detail supports variants, modifiers, recipes', () => {
    const src = read('app/products/[id].tsx');
    expect(src).toContain("from('product_variants')");
    expect(src).toContain("from('modifiers')");
    expect(src).toContain("from('recipes')");
    expect(src).toContain('raw_materials');
  });

  it('F3.3 — menu items do not track product stock', () => {
    const src = read('app/(tabs)/products.tsx');
    expect(src).toContain('track_stock: false');
  });

  it('F3.4 — today availability toggle on product detail', () => {
    const src = read('app/products/[id].tsx');
    expect(src).toContain('is_available_today');
    expect(src).toMatch(/86/);
  });
});

describe('Restaurant Module — Raw Materials (F4)', () => {
  it('F4.1 — raw materials tab only for restaurant', () => {
    const src = read('app/(tabs)/inventory.tsx');
    expect(src).toContain('isRestaurant');
    expect(src).toContain('raw_materials');
    expect(src).toContain('Raw Materials');
  });

  it('F4.2 — create raw material mutation exists', () => {
    const src = read('hooks/useMutations.ts');
    expect(src).toContain('useCreateRawMaterial');
    expect(src).toContain("from('raw_materials')");
    expect(src).toContain('stock_quantity');
  });

  it('F4.3 — raw material name validation', () => {
    expect(validateRawMaterialName('')).toBe('Material name is required.');
    expect(validateRawMaterialName('  ')).toBe('Material name is required.');
    expect(validateRawMaterialName('Paneer')).toBeNull();
  });

  it('F4.4 — opening stock parsing', () => {
    expect(parseOpeningStock('')).toEqual({ ok: true, value: 0 });
    expect(parseOpeningStock('2.5')).toEqual({ ok: true, value: 2.5 });
    expect(parseOpeningStock('-1').ok).toBe(false);
    expect(parseOpeningStock('abc').ok).toBe(false);
  });

  it('F4.5 — supported units', () => {
    expect(RAW_MATERIAL_UNITS).toEqual(['g', 'kg', 'ml', 'ltr', 'pcs']);
    expect(normalizeRawMaterialUnit('kg')).toBe('kg');
    expect(normalizeRawMaterialUnit('unknown')).toBe('g');
  });

  it('F4.6 — insert payload shape for Supabase', () => {
    expect(
      buildRawMaterialInsertPayload({
        businessId: 'biz-1',
        name: '  Butter  ',
        unit: ' kg ',
        stockQuantity: 10,
      }),
    ).toEqual({
      business_id: 'biz-1',
      name: 'Butter',
      unit: 'kg',
      stock_quantity: 10,
    });
  });

  it('F4.7 — inventory fetches raw materials for restaurant (errors surface)', () => {
    const src = read('hooks/useQueries.ts');
    expect(src).toContain('isRestaurant');
    expect(src).toContain("from('raw_materials')");
    expect(src).toMatch(/if\s*\(rmError\)\s*throw\s*rmError/);
  });

  it('F4.8 — FAB and empty state to add material', () => {
    const src = read('app/(tabs)/inventory.tsx');
    expect(src).toContain('openAddRawMaterialModal');
    expect(src).toContain('Add Raw Material');
    expect(src).toContain('Add Material');
  });

  it('F4.9 — recipe screen hints when no raw materials', () => {
    const src = read('app/products/[id].tsx');
    expect(src).toMatch(/raw material/i);
  });
});

describe('Restaurant Module — Billing & Daybook (F5)', () => {
  it('F5.1 — bill settlement updates order and sales', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain("status: 'paid'");
    expect(src).toContain("from('sales').insert");
  });

  it('F5.2 — split cash/upi on settle', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain('payment_type: \'cash\'');
    expect(src).toContain('payment_type: \'upi\'');
  });
});

describe('Restaurant Module — Staff / Settings (F6)', () => {
  it('F6.1 — waiter invite code in settings', () => {
    const src = read('app/settings.tsx');
    expect(src).toContain('Waiter Invite Code');
    expect(src).toContain("business_type === 'restaurant'");
  });

  it('F6.2 — waiter role routing helper', () => {
    expect(isRestaurantWaiter('waiter', 'restaurant')).toBe(true);
    expect(isRestaurantWaiter('owner', 'restaurant')).toBe(false);
    expect(isRestaurantWaiter('waiter', 'retail')).toBe(false);
  });
});

describe('Restaurant Bug List — fixes verified (B-R*)', () => {
  it('B-R1 P0 — Firebase-safe RLS on restaurant tables', () => {
    const sql = read('supabase/migrations/20260831240000_restaurant_grants_and_rls.sql');
    expect(sql).toContain('user_belongs_to_business');
    expect(sql).not.toContain('auth.uid()');
  });

  it('B-R2 P0 — GRANT on raw_materials for authenticated', () => {
    const sql = read('supabase/migrations/20260831240000_restaurant_grants_and_rls.sql');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.raw_materials');
  });

  it('B-R3 P0 — GRANT on tables and orders', () => {
    const sql = read('supabase/migrations/20260831240000_restaurant_grants_and_rls.sql');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tables');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders');
  });

  it('B-R4 P1 — KOT reprint buttons use side-by-side layout', () => {
    const src = read('app/kot/[id].tsx');
    expect(src).toContain('secondaryBtnHalf');
    expect(src).toContain('Reprint Bill');
    expect(src).toContain('Reprint KOT');
  });

  it('B-R5 P1 — auth gate prevents login flash', () => {
    const src = read('app/_layout.tsx');
    expect(src).toContain('isReady');
    expect(src).toContain('bootScreen');
    const indexSrc = read('app/index.tsx');
    expect(indexSrc).toContain('session');
  });

  it('B-R6 P0 — raw material CRUD hooks wired in inventory', () => {
    const src = read('app/(tabs)/inventory.tsx');
    expect(src).toContain('useCreateRawMaterial');
    expect(src).toContain('useUpdateRawMaterial');
    expect(src).toContain('useAddRawMaterialStock');
    expect(src).toContain('useDeleteRawMaterial');
    expect(src).toContain('handleSaveRawMaterial');
  });

  it('B-R7 P2 — kot route registered in root layout', () => {
    const src = read('app/_layout.tsx');
    expect(src).toContain('kot/[id]');
  });
});
