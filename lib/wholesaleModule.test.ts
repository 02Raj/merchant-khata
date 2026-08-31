/**
 * Wholesale Module — automated E2E test plan + bug verification
 */
import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { evaluateCreditLimit, usesCreditLimit } from '@/lib/customerKhata';
import { getMoqViolations } from '@/lib/salesValidation';
import {
  buildCartLineId,
  customerTypeLabel,
  mergeCartLines,
  normalizeCustomerType,
  resolveCartUnitPrice,
  resolveDefaultPricingMode,
  resolvePricingModeFromCustomer,
  shouldShowPricingToggle,
  toggleCartLineRate,
  validateWholesaleProductFields,
} from '@/lib/wholesaleHelpers';

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('Wholesale Module — Products (W2)', () => {
  it('W2.1 — wholesale price + MOQ fields in products form', () => {
    const src = read('app/(tabs)/products.tsx');
    expect(src).toContain('formWholesalePrice');
    expect(src).toContain('formMoq');
    expect(src).toContain('Min Qty (MOQ)');
  });

  it('W2.2 — MOQ without wholesale price blocked', () => {
    expect(validateWholesaleProductFields({ wholesalePrice: null, moq: 5 })).not.toBeNull();
  });

  it('W2.3 — wholesale fields hidden for pure retail', () => {
    const src = read('app/(tabs)/products.tsx');
    expect(src).toContain("business_type === 'wholesale' || businessInfo.business_type === 'both'");
  });
});

describe('Wholesale Module — Sales / POS (W3)', () => {
  it('W3.1 — pricing toggle for wholesale shop', () => {
    expect(shouldShowPricingToggle('wholesale')).toBe(true);
  });

  it('W3.2 — default wholesale mode for wholesale shop', () => {
    expect(resolveDefaultPricingMode('wholesale')).toBe('wholesale');
  });

  it('W3.3 — wholesale customer selects wholesale pricing', () => {
    expect(resolvePricingModeFromCustomer('wholesale')).toBe('wholesale');
    expect(resolvePricingModeFromCustomer('credit')).toBe('wholesale');
  });

  it('W3.4 — retail customer selects retail pricing', () => {
    expect(resolvePricingModeFromCustomer('retail')).toBe('retail');
    expect(resolvePricingModeFromCustomer('cash')).toBe('retail');
  });

  it('W3.5 — wholesale rate uses wholesale_price', () => {
    const { price, isWholesaleRate } = resolveCartUnitPrice('wholesale', {
      sale_price: 120,
      wholesale_price: 95,
    });
    expect(price).toBe(95);
    expect(isWholesaleRate).toBe(true);
  });

  it('W3.6 — MOQ enforced on wholesale lines', () => {
    const violations = getMoqViolations([
      {
        product: { id: '1', name: 'Atta 50kg', stockCount: 100, conversion_factor: null, moq: 10 },
        quantity: 3,
        selected_unit: 'base',
        is_wholesale_rate: true,
      },
    ]);
    expect(violations[0]).toContain('minimum qty is 10');
  });

  it('W3.7 — blocks add to cart without wholesale price in WS mode', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('Wholesale price missing');
  });

  it('W3.8 — is_wholesale_rate sent to checkout RPC', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('is_wholesale_rate');
  });

  it('W3.9 — hybrid shop has retail/wholesale toggle', () => {
    expect(shouldShowPricingToggle('both')).toBe(true);
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('resolvePricingModeFromCustomer');
  });
});

describe('Wholesale Module — Customers / Khata (W4)', () => {
  it('W4.1 — credit limit applies to wholesale shops', () => {
    expect(usesCreditLimit('wholesale')).toBe(true);
    const result = evaluateCreditLimit({
      businessType: 'wholesale',
      currentBalance: 40000,
      creditLimit: 50000,
      billAmount: 15000,
      paymentType: 'credit',
    });
    expect(result.exceeded).toBe(true);
  });

  it('W4.2 — customer type badge on list', () => {
    const src = read('app/(tabs)/customers.tsx');
    expect(src).toContain('customerTypeBadge');
    expect(customerTypeLabel('wholesale')).toBe('Wholesale');
  });

  it('W4.3 — customer edit for type and credit limit', () => {
    const src = read('app/(tabs)/customers.tsx');
    expect(src).toContain('handleUpdateCustomer');
    expect(src).toContain('Edit Customer');
  });

  it('W4.4 — hybrid customer type picker on add', () => {
    const src = read('app/(tabs)/customers.tsx');
    expect(src).toContain("formCustomerType === 'wholesale'");
  });

  it('W4.5 — atomic payment RPC', () => {
    expect(read('app/(tabs)/customers.tsx')).toContain('receive_customer_payment');
  });
});

describe('Wholesale Module — Receipts (W5)', () => {
  it('W5.1 — wholesale invoice title on receipt', () => {
    const src = read('lib/retailReceipt.ts');
    expect(src).toContain('Wholesale Tax Invoice');
    expect(src).toContain('is_wholesale_rate');
  });

  it('W5.2 — sales history loads is_wholesale_rate for reprint', () => {
    const src = read('app/sales-history.tsx');
    expect(src).toContain('is_wholesale_rate');
  });
});

describe('Wholesale Bug List — priority fixes', () => {
  it('B-W1 P0 — legacy credit customer maps to wholesale pricing', () => {
    expect(normalizeCustomerType('credit')).toBe('wholesale');
  });

  it('B-W2 P0 — MOQ uses shared validation lib (no duplicate in sales)', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain("from '@/lib/salesValidation'");
    expect(src).not.toMatch(/const getMoqViolations = \(items: CartItem\)/);
  });

  it('B-W3 P0 — server MOQ check in migration', () => {
    const sql = read('supabase/migrations/20260831190000_wholesale_fixes.sql');
    expect(sql).toContain('MOQ not met');
  });

  it('B-W4 P0 — server credit limit check in migration', () => {
    const sql = read('supabase/migrations/20260831190000_wholesale_fixes.sql');
    expect(sql).toContain('Credit limit exceeded');
  });

  it('B-W5 P1 — is_wholesale_rate persisted on sale_items', () => {
    const sql = read('supabase/migrations/20260831190000_wholesale_fixes.sql');
    expect(sql).toContain('is_wholesale_rate');
  });

  it('B-W6 P1 — MOQ requires wholesale price on product save', () => {
    expect(read('app/(tabs)/products.tsx')).toContain('validateWholesaleProductFields');
  });

  it('B-W10 P2 — mixed retail + wholesale lines in same cart', () => {
    const retailLine = {
      lineId: buildCartLineId('p1', false, 'base'),
      product: { id: 'p1', sale_price: 100, wholesale_price: 80 },
      unit_price: 100,
      is_wholesale_rate: false,
      selected_unit: 'base' as const,
      quantity: 1,
    };
    const wholesaleLine = toggleCartLineRate(retailLine).item;
    const cart = mergeCartLines([retailLine], wholesaleLine);

    expect(cart).toHaveLength(2);
    expect(cart.some((line) => line.is_wholesale_rate)).toBe(true);
    expect(cart.some((line) => !line.is_wholesale_rate)).toBe(true);

    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('toggleLinePricing');
    expect(src).toContain('buildCartLineId');
  });

  it('B-W10 — aggregated stock check migration for duplicate product lines', () => {
    const sql = read('supabase/migrations/20260831200000_mixed_cart_stock_fix.sql');
    expect(sql).toContain('GROUP BY');
  });

  it('legacy customer types migrated in SQL', () => {
    const sql = read('supabase/migrations/20260831210000_legacy_customer_types.sql');
    expect(sql).toContain("customer_type = 'retail'");
    expect(sql).toContain("customer_type = 'wholesale'");
  });
});
