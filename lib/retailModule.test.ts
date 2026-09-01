/**
 * Retail Module — automated verification of all E2E test cases + bug fixes.
 * Maps to test plan IDs (R*) and bug IDs (B*).
 */
import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { aggregateDaybookSales } from '@/lib/daybookCalc';
import {
  evaluateCreditLimit,
  formatPhoneForWhatsApp,
  showCustomerCreditLimitField,
  usesCreditLimit,
} from '@/lib/customerKhata';
import { toE164India } from '@/lib/phone';
import { buildRetailPdfHtml, buildRetailThermalHtml } from '@/lib/retailReceipt';
import {
  computePayableTotal,
  formatPaymentModeLabel,
  getSalePaymentSplit,
  resolvePaymentSplit,
  resolveSalePaymentType,
  validateCheckoutPayment,
} from '@/lib/salesCheckout';
import {
  filterProductsForPos,
  getEffectiveCartQuantity,
  getMoqViolations,
  getStockViolations,
  shouldBlockCreditWithoutCustomer,
} from '@/lib/salesValidation';

const ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Retail Module E2E — Module 3 Sales / POS', () => {
  // R3.1 Walk-in cash sale
  it('R3.1 — cash sale resolves to full cash split', () => {
    const { split } = resolvePaymentSplit({
      paymentMode: 'simple',
      paymentType: 'cash',
      payableTotal: 500,
      splitCash: 0,
      splitUpi: 0,
    });
    expect(resolveSalePaymentType(split)).toBe('cash');
    expect(split.cash).toBe(500);
    expect(validateCheckoutPayment({ split, payableTotal: 500, hasCustomer: false })).toBeNull();
  });

  // R3.2 UPI sale
  it('R3.2 — UPI sale resolves to upi payment type', () => {
    const { split } = resolvePaymentSplit({
      paymentMode: 'simple',
      paymentType: 'upi',
      payableTotal: 750,
      splitCash: 0,
      splitUpi: 0,
    });
    expect(resolveSalePaymentType(split)).toBe('upi');
  });

  // R3.3 Udhaar sale
  it('R3.3 — credit sale requires customer', () => {
    const { split } = resolvePaymentSplit({
      paymentMode: 'simple',
      paymentType: 'credit',
      payableTotal: 1000,
      splitCash: 0,
      splitUpi: 0,
    });
    expect(validateCheckoutPayment({ split, payableTotal: 1000, hasCustomer: false })).toContain('customer');
    expect(validateCheckoutPayment({ split, payableTotal: 1000, hasCustomer: true })).toBeNull();
  });

  // R3.4 Udhaar bina customer — B2
  it('R3.4 / B2 — blocks credit without customer', () => {
    expect(shouldBlockCreditWithoutCustomer('credit', false)).toBe(true);
    expect(shouldBlockCreditWithoutCustomer('credit', true)).toBe(false);
  });

  // R3.5 Barcode search at POS — B10
  it('R3.5 / B10 — POS search matches barcode', () => {
    const products = [
      { name: 'Salt', barcode: '8901234567890', is_active: true },
      { name: 'Sugar', barcode: '8909999999999', is_active: true },
    ];
    const found = filterProductsForPos(products, '8901234567890');
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('Salt');
  });

  // R3.10 Alternate unit
  it('R3.10 — alternate unit uses conversion factor for stock', () => {
    const qty = getEffectiveCartQuantity({
      product: { id: '1', name: 'Oil', stockCount: 24, conversion_factor: 12 },
      quantity: 2,
      selected_unit: 'alternate',
    });
    expect(qty).toBe(24);
  });

  // R3.11 Stock over-sell — B1
  it('R3.11 / B1 — blocks checkout when stock insufficient', () => {
    const violations = getStockViolations([
      {
        product: { id: '1', name: 'Biscuit', stockCount: 2, conversion_factor: null },
        quantity: 5,
        selected_unit: 'base',
      },
    ]);
    expect(violations.length).toBeGreaterThan(0);
  });

  // R3.15 Retail mode — no wholesale toggle in code for pure retail
  it('R3.15 — retail business hides pricing toggle in sales screen', () => {
    const salesSource = readProjectFile('app/(tabs)/sales.tsx');
    expect(salesSource).toContain('shouldShowPricingToggle');
    expect(salesSource).toContain('showPricingToggle');
  });

  // B14 Bill discount
  it('B14 — discount reduces payable total', () => {
    expect(computePayableTotal(1000, 150)).toBe(850);
    expect(computePayableTotal(100, 500)).toBe(0);
  });

  // B12 Partial payment
  it('B12 — partial payment: cash + udhaar remainder', () => {
    const { split } = resolvePaymentSplit({
      paymentMode: 'split',
      paymentType: 'cash',
      payableTotal: 1000,
      splitCash: 400,
      splitUpi: 0,
    });
    expect(split.credit).toBe(600);
    expect(resolveSalePaymentType(split)).toBe('partial');
  });

  // B15 Split payment cash + UPI
  it('B15 — split cash + UPI on one bill', () => {
    const { split, error } = resolvePaymentSplit({
      paymentMode: 'split',
      paymentType: 'cash',
      payableTotal: 500,
      splitCash: 300,
      splitUpi: 200,
    });
    expect(error).toBeNull();
    expect(formatPaymentModeLabel(split)).toContain('Cash');
    expect(formatPaymentModeLabel(split)).toContain('UPI');
    expect(resolveSalePaymentType(split)).toBe('partial');
  });
});

describe('Retail Module E2E — Module 2 Products', () => {
  // R2.11 Inactive products — B8
  it('R2.11 / B8 — hides inactive products by default', () => {
    const products = [
      { name: 'Active Item', is_active: true },
      { name: 'Dead Item', is_active: false },
    ];
    expect(filterProductsForPos(products, '', false)).toHaveLength(1);
    expect(filterProductsForPos(products, '', true)).toHaveLength(2);
  });
});

describe('Retail Module E2E — Module 4 Customers / Khata', () => {
  // R4.4 WhatsApp reminder
  it('R4.4 — WhatsApp phone formatting works for valid Indian number', () => {
    expect(formatPhoneForWhatsApp('9876543210')).toBe('919876543210');
  });

  // R4.5 Credit limit field retail — B22
  it('R4.5 / B22 — credit limit field shown for retail shops', () => {
    expect(showCustomerCreditLimitField('retail')).toBe(true);
    expect(usesCreditLimit('retail')).toBe(false);
  });

  // R4.7 Phone validation — B18
  it('R4.7 / B18 — invalid phone rejected, valid accepted', () => {
    expect(toE164India('N/A').ok).toBe(false);
    expect(toE164India('9876543210').ok).toBe(true);
  });

  // B22 retail optional credit limit enforcement
  it('B22 — retail customer with credit limit gets warning on udhaar', () => {
    const result = evaluateCreditLimit({
      businessType: 'retail',
      currentBalance: 9000,
      creditLimit: 10000,
      billAmount: 2000,
      paymentType: 'credit',
    });
    expect(result.exceeded).toBe(true);
  });

  // B4/B21 Payment RPC used
  it('B4 / B21 — customers screen uses atomic payment RPC', () => {
    const source = readProjectFile('app/(tabs)/customers.tsx');
    expect(source).toContain("supabase.rpc('receive_customer_payment'");
  });
});

describe('Retail Module E2E — Module 6 Suppliers', () => {
  // R6.3 Supplier purchase stock — B3
  it('R6.3 / B3 — supplier purchase uses record_supplier_purchase RPC', () => {
    const source = readProjectFile('app/(tabs)/suppliers.tsx');
    expect(source).toContain("supabase.rpc('record_supplier_purchase'");
  });
});

describe('Retail Module E2E — Module 7 Daybook', () => {
  // R7.1 Cash sales
  it('R7.1 — daybook sums cash sales correctly', () => {
    const agg = aggregateDaybookSales([
      { total_amount: 200, payment_type: 'cash' },
      { total_amount: 300, payment_type: 'cash' },
    ]);
    expect(agg.cashSales).toBe(500);
  });

  // R7.2 UPI sales
  it('R7.2 — daybook sums UPI sales correctly', () => {
    const agg = aggregateDaybookSales([{ total_amount: 450, payment_type: 'upi' }]);
    expect(agg.upiSales).toBe(450);
  });

  // R7.6 Credit sale does not inflate cash
  it('R7.6 — credit sale does not add to cash/UPI', () => {
    const agg = aggregateDaybookSales([{ total_amount: 800, payment_type: 'credit' }]);
    expect(agg.creditSales).toBe(800);
    expect(agg.cashSales).toBe(0);
    expect(agg.upiSales).toBe(0);
  });

  // Split bill daybook
  it('R7.x — split bill counted in cash and UPI separately', () => {
    const agg = aggregateDaybookSales([
      {
        total_amount: 500,
        payment_type: 'partial',
        cash_amount: 300,
        upi_amount: 200,
        credit_amount: 0,
      },
    ]);
    expect(agg.cashSales).toBe(300);
    expect(agg.upiSales).toBe(200);
  });
});

describe('Retail Module E2E — Module 8 Print & History', () => {
  const snapshot = {
    saleId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    date: '31/08/2026, 5:00:00 pm',
    customer: { name: 'Ramesh', customer_type: 'retail', balance: 500 },
    paymentType: 'partial',
    paymentSplit: { cash: 200, upi: 100, credit: 200 },
    discountAmount: 50,
    totals: {
      grandTotal: 450,
      taxTotal: 40,
      itemsForRpc: [
        {
          product_id: 'p1',
          quantity: 2,
          unit_price: 100,
          subtotal: 200,
          product: { name: 'Soap', hsn_code: '3401' },
        },
      ],
    },
  };

  // R8.2 Bill number
  it('R8.2 — bill number appears on thermal receipt', () => {
    const html = buildRetailThermalHtml(snapshot, { name: 'Test Shop', gstin: '29ABCDE1234F1Z5' }, '80mm');
    expect(html).toContain('AAAAAAA');
  });

  // B16 GSTIN / HSN
  it('B16 — GSTIN and HSN on PDF bill', () => {
    const html = buildRetailPdfHtml(snapshot, { name: 'Test Shop', gstin: '29ABCDE1234F1Z5' });
    expect(html).toContain('GSTIN: 29ABCDE1234F1Z5');
    expect(html).toContain('HSN: 3401');
  });

  // B7 Credit ledger on bill
  it('B7 — credit portion shows ledger summary on PDF', () => {
    const html = buildRetailPdfHtml(snapshot, { name: 'Test Shop' });
    expect(html).toContain('Account Ledger Summary');
    expect(html).toContain('Udhaar on this bill');
  });

  // B13 Sales history screen exists
  it('B13 — sales history screen with reprint and return', () => {
    const source = readProjectFile('app/sales-history.tsx');
    expect(source).toContain('reprintBill');
    expect(source).toContain('process_sale_return');
    expect(source).toContain('Process Return');
  });

  // B9 Dashboard See All
  it('B9 — dashboard links to sales history', () => {
    const source = readProjectFile('app/(tabs)/dashboard.tsx');
    expect(source).toContain('/sales-history');
  });
});

describe('Retail Module E2E — Hybrid / Wholesale extras', () => {
  it('MOQ enforced for wholesale rate items', () => {
    const violations = getMoqViolations([
      {
        product: { id: '1', name: 'Rice Bag', stockCount: 100, conversion_factor: null, moq: 5 },
        quantity: 2,
        selected_unit: 'base',
        is_wholesale_rate: true,
      },
    ]);
    expect(violations[0]).toContain('minimum qty is 5');
  });
});

describe('Retail Module — Bug fixes DB migration smoke tests', () => {
  it('B1 — process_checkout has stock check in migration', () => {
    const sql = readProjectFile('supabase/migrations/20260831170000_retail_fixes.sql');
    expect(sql).toContain('Insufficient stock');
  });

  it('B19 — barcode unique index in migration', () => {
    const sql = readProjectFile('supabase/migrations/20260831170000_retail_fixes.sql');
    expect(sql).toContain('products_business_barcode_unique');
  });

  it('B20 — sale return RPC in P2 migration', () => {
    const sql = readProjectFile('supabase/migrations/20260831180000_retail_p2_features.sql');
    expect(sql).toContain('process_sale_return');
    expect(sql).toContain('sale_returns');
  });

  it('B14/B15 — discount and split columns in P2 migration', () => {
    const sql = readProjectFile('supabase/migrations/20260831180000_retail_p2_features.sql');
    expect(sql).toContain('discount_amount');
    expect(sql).toContain('cash_amount');
    expect(sql).toContain('upi_amount');
    expect(sql).toContain('credit_amount');
  });

  it('B6 — barcode debounce in sales screen', () => {
    const source = readProjectFile('app/(tabs)/sales.tsx');
    expect(source).toContain('lastScannedRef');
    expect(source).toContain('2000');
  });

  it('B11 — card payment removed from sales', () => {
    const source = readProjectFile('app/(tabs)/sales.tsx');
    expect(source).not.toMatch(/paymentType === 'card'/);
  });

  it('B23 — expenses GRANT + Firebase RLS migration', () => {
    const sql = readProjectFile('supabase/migrations/20260831250000_expenses_grants_and_rls.sql');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses');
    expect(sql).toContain('user_belongs_to_business');
  });

  it('B23 — dashboard add expense wired', () => {
    const source = readProjectFile('app/(tabs)/dashboard.tsx');
    expect(source).toContain("from('expenses')");
    expect(source).toContain('handleAddExpense');
  });
});

describe('Retail Module — sales history payment split legacy rows', () => {
  it('legacy credit sale without split columns infers credit amount', () => {
    const split = getSalePaymentSplit({
      payment_type: 'credit',
      total_amount: 1200,
      cash_amount: 0,
      upi_amount: 0,
      credit_amount: 0,
    });
    expect(split.credit).toBe(1200);
  });
});
