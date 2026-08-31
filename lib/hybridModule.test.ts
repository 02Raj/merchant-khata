/**
 * Hybrid Module (retail + wholesale, business_type = both) — automated E2E tests + bug verification.
 */
import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { evaluateCreditLimit, usesCreditLimit } from '@/lib/customerKhata';
import { aggregateDaybookSales } from '@/lib/daybookCalc';
import { getMoqViolations } from '@/lib/salesValidation';
import {
  buildRetailPdfHtml,
  isWholesaleInvoice,
  snapshotHasWholesaleLines,
} from '@/lib/retailReceipt';
import {
  buildCartLineId,
  isHybridShop,
  mergeCartLines,
  normalizeCustomerType,
  resolveCartUnitPrice,
  resolveDefaultPricingMode,
  resolveNewCustomerType,
  resolvePricingModeFromCustomer,
  shouldShowPricingToggle,
  toggleCartLineRate,
  validateWholesaleShopProduct,
  walkInCustomerLabel,
} from '@/lib/wholesaleHelpers';

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const baseSnapshot = {
  saleId: 'sale-1',
  date: '31 Aug 2026',
  paymentType: 'cash',
  totals: {
    grandTotal: 200,
    taxTotal: 0,
    itemsForRpc: [
      {
        product_id: 'p1',
        quantity: 1,
        unit_price: 100,
        subtotal: 100,
        is_wholesale_rate: false,
      },
    ],
  },
};

describe('Hybrid Module — Shop setup (H1)', () => {
  it('H1.1 — hybrid shop identified', () => {
    expect(isHybridShop('both')).toBe(true);
    expect(isHybridShop('retail')).toBe(false);
    expect(isHybridShop('wholesale')).toBe(false);
  });

  it('H1.2 — pricing toggle visible on hybrid POS', () => {
    expect(shouldShowPricingToggle('both')).toBe(true);
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('showPricingToggle');
  });

  it('H1.3 — default pricing mode is retail on hybrid', () => {
    expect(resolveDefaultPricingMode('both')).toBe('retail');
  });

  it('H1.4 — wholesale fields on products for hybrid', () => {
    const src = read('app/(tabs)/products.tsx');
    expect(src).toContain("business_type === 'both'");
    expect(src).toContain('formWholesalePrice');
  });
});

describe('Hybrid Module — Customers (H2)', () => {
  it('H2.1 — retail/wholesale type picker on customers screen', () => {
    const src = read('app/(tabs)/customers.tsx');
    expect(src).toContain("business_type === 'both'");
    expect(src).toContain('formCustomerType');
  });

  it('H2.2 — customer type picker on POS add-customer modal', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain("business_type === 'both'");
    expect(src).toContain('newCustomerType');
  });

  it('H2.3 — resolveNewCustomerType respects hybrid selection', () => {
    expect(resolveNewCustomerType('both', 'retail')).toBe('retail');
    expect(resolveNewCustomerType('both', 'wholesale')).toBe('wholesale');
  });

  it('H2.4 — selecting customer syncs pricing mode', () => {
    expect(resolvePricingModeFromCustomer('wholesale')).toBe('wholesale');
    expect(resolvePricingModeFromCustomer('retail')).toBe('retail');
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('resolvePricingModeFromCustomer(item.customer_type)');
  });

  it('H2.5 — walk-in resets to default retail mode', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('setPricingMode(defaultPricingMode)');
  });
});

describe('Hybrid Module — Sales / mixed cart (H3)', () => {
  it('H3.1 — retail and wholesale lines coexist in cart', () => {
    const retailLine = {
      lineId: buildCartLineId('p1', false, 'base'),
      product: { id: 'p1', sale_price: 120, wholesale_price: 95 },
      unit_price: 120,
      is_wholesale_rate: false,
      selected_unit: 'base' as const,
      quantity: 2,
    };
    const { item: wholesaleLine } = toggleCartLineRate(retailLine);
    const cart = mergeCartLines([retailLine], {
      ...retailLine,
      lineId: buildCartLineId('p2', true, 'base'),
      product: { id: 'p2', sale_price: 50, wholesale_price: 40 },
      unit_price: 40,
      is_wholesale_rate: true,
      quantity: 10,
    });

    expect(cart).toHaveLength(2);
    expect(cart.filter((l) => l.is_wholesale_rate)).toHaveLength(1);
    expect(cart.filter((l) => !l.is_wholesale_rate)).toHaveLength(1);
  });

  it('H3.2 — MOQ enforced only on wholesale-rate lines', () => {
    const retailViolation = getMoqViolations([
      {
        product: { id: '1', name: 'Rice', stockCount: 100, conversion_factor: null, moq: 10 },
        quantity: 2,
        selected_unit: 'base',
        is_wholesale_rate: false,
      },
    ]);
    expect(retailViolation).toHaveLength(0);

    const wholesaleViolation = getMoqViolations([
      {
        product: { id: '1', name: 'Rice', stockCount: 100, conversion_factor: null, moq: 10 },
        quantity: 2,
        selected_unit: 'base',
        is_wholesale_rate: true,
      },
    ]);
    expect(wholesaleViolation[0]).toContain('minimum qty is 10');
  });

  it('H3.3 — wholesale price optional on hybrid product add', () => {
    expect(validateWholesaleShopProduct('both', null)).toBeNull();
    expect(validateWholesaleShopProduct('wholesale', null)).not.toBeNull();
  });

  it('H3.4 — per-line rate toggle in cart UI', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('toggleLinePricing');
    expect(src).toContain('buildCartLineId');
  });

  it('H3.5 — pricing mode header does not reprice entire cart', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).not.toMatch(/setPricingMode\([^)]+\)[\s\S]{0,200}setCart\(/);
  });
});

describe('Hybrid Module — Credit / Khata (H4)', () => {
  it('H4.1 — hybrid shop uses credit limit feature', () => {
    expect(usesCreditLimit('both')).toBe(true);
  });

  it('H4.2 — retail customer on hybrid: no limit rules unless configured', () => {
    const result = evaluateCreditLimit({
      businessType: 'both',
      customerType: 'retail',
      currentBalance: 0,
      creditLimit: null,
      billAmount: 5000,
      paymentType: 'credit',
    });
    expect(result.applies).toBe(false);
  });

  it('H4.3 — wholesale customer on hybrid: unlimited when no limit', () => {
    const result = evaluateCreditLimit({
      businessType: 'both',
      customerType: 'wholesale',
      currentBalance: 20000,
      creditLimit: null,
      billAmount: 5000,
      paymentType: 'credit',
    });
    expect(result.applies).toBe(true);
    expect(result.exceeded).toBe(false);
  });

  it('H4.4 — configured limit enforced for any hybrid customer', () => {
    const result = evaluateCreditLimit({
      businessType: 'both',
      customerType: 'retail',
      currentBalance: 9000,
      creditLimit: 10000,
      billAmount: 2000,
      paymentType: 'credit',
    });
    expect(result.exceeded).toBe(true);
  });

  it('H4.5 — checkout passes customerType to credit limit check', () => {
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('customerType: selectedCustomer?.customer_type');
  });
});

describe('Hybrid Module — Receipts (H5)', () => {
  it('H5.1 — retail-only bill shows Tax Invoice', () => {
    expect(isWholesaleInvoice(baseSnapshot)).toBe(false);
    const html = buildRetailPdfHtml(baseSnapshot, { name: 'Hybrid Shop', businessType: 'both' });
    expect(html).toContain('Tax Invoice');
    expect(html).not.toContain('Wholesale Tax Invoice');
  });

  it('H5.2 — wholesale lines trigger wholesale invoice title', () => {
    const snapshot = {
      ...baseSnapshot,
      totals: {
        ...baseSnapshot.totals,
        itemsForRpc: [{ ...baseSnapshot.totals.itemsForRpc[0], is_wholesale_rate: true }],
      },
    };
    expect(snapshotHasWholesaleLines(snapshot)).toBe(true);
    expect(isWholesaleInvoice(snapshot)).toBe(true);
    const html = buildRetailPdfHtml(snapshot, { name: 'Hybrid Shop', businessType: 'both' });
    expect(html).toContain('Wholesale Tax Invoice');
  });

  it('H5.3 — wholesale customer with retail lines still wholesale invoice', () => {
    const snapshot = {
      ...baseSnapshot,
      customer: { name: 'B2B Buyer', customer_type: 'wholesale' },
    };
    expect(isWholesaleInvoice(snapshot)).toBe(true);
  });

  it('H5.4 — legacy credit customer normalized for invoice', () => {
    const snapshot = {
      ...baseSnapshot,
      customer: { name: 'Old Credit', customer_type: 'credit' },
    };
    expect(normalizeCustomerType('credit')).toBe('wholesale');
    expect(isWholesaleInvoice(snapshot)).toBe(true);
  });

  it('H5.5 — walk-in label on hybrid receipt', () => {
    expect(walkInCustomerLabel('both')).toBe('Walk-in (Retail)');
    const html = buildRetailPdfHtml(baseSnapshot, { name: 'Hybrid Shop', businessType: 'both' });
    expect(html).toContain('Walk-in (Retail)');
  });
});

describe('Hybrid Module — Daybook (H6)', () => {
  it('H6.1 — split payments aggregate correctly', () => {
    const totals = aggregateDaybookSales([
      {
        total_amount: 1000,
        payment_type: 'partial',
        cash_amount: 400,
        upi_amount: 300,
        credit_amount: 300,
      },
      {
        total_amount: 500,
        payment_type: 'cash',
        cash_amount: 500,
        upi_amount: 0,
        credit_amount: 0,
      },
    ]);
    expect(totals.cashSales).toBe(900);
    expect(totals.upiSales).toBe(300);
    expect(totals.creditSales).toBe(300);
    expect(totals.totalSales).toBe(1500);
  });
});

describe('Hybrid Bug List — fixes verified', () => {
  it('B-H1 P1 — hybrid retail customer credit rules match retail shop', () => {
    const hybridRetail = evaluateCreditLimit({
      businessType: 'both',
      customerType: 'retail',
      currentBalance: 0,
      creditLimit: null,
      billAmount: 1000,
      paymentType: 'credit',
    });
    const pureRetail = evaluateCreditLimit({
      businessType: 'retail',
      customerType: 'retail',
      currentBalance: 0,
      creditLimit: null,
      billAmount: 1000,
      paymentType: 'credit',
    });
    expect(hybridRetail.applies).toBe(pureRetail.applies);
  });

  it('B-H2 P1 — invoice title uses cart lines not only customer type', () => {
    const retailCustomerWsLine = {
      ...baseSnapshot,
      customer: { name: 'Shop', customer_type: 'retail' },
      totals: {
        ...baseSnapshot.totals,
        itemsForRpc: [{ ...baseSnapshot.totals.itemsForRpc[0], is_wholesale_rate: true }],
      },
    };
    expect(isWholesaleInvoice(retailCustomerWsLine)).toBe(true);
  });

  it('B-H3 P2 — walk-in label respects business type', () => {
    expect(walkInCustomerLabel('wholesale')).toBe('Walk-in (Wholesale)');
    expect(walkInCustomerLabel('both')).toBe('Walk-in (Retail)');
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('walkInCustomerLabel');
  });

  it('B-H4 P1 — resolveCartUnitPrice retail vs wholesale on same product', () => {
    const product = { sale_price: 100, wholesale_price: 80 };
    expect(resolveCartUnitPrice('retail', product).price).toBe(100);
    expect(resolveCartUnitPrice('wholesale', product).price).toBe(80);
  });

  it('B-H5 P0 — mixed cart stock aggregation in DB', () => {
    const sql = read('supabase/migrations/20260831200000_mixed_cart_stock_fix.sql');
    expect(sql).toContain('GROUP BY');
  });

  it('B-H6 P1 — is_wholesale_rate persisted per line', () => {
    const sql = read('supabase/migrations/20260831190000_wholesale_fixes.sql');
    expect(sql).toContain('is_wholesale_rate');
    const src = read('app/(tabs)/sales.tsx');
    expect(src).toContain('is_wholesale_rate');
  });
});
