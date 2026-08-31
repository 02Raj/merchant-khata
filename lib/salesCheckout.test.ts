import { describe, expect, it } from '@jest/globals';

import {
  computePayableTotal,
  getSalePaymentSplit,
  resolvePaymentSplit,
  resolveSalePaymentType,
  validateCheckoutPayment,
} from '@/lib/salesCheckout';

describe('salesCheckout', () => {
  it('applies discount to payable total', () => {
    expect(computePayableTotal(1000, 100)).toBe(900);
    expect(computePayableTotal(100, 500)).toBe(0);
  });

  it('resolves simple cash payment', () => {
    const { split, error } = resolvePaymentSplit({
      paymentMode: 'simple',
      paymentType: 'cash',
      payableTotal: 500,
      splitCash: 0,
      splitUpi: 0,
    });

    expect(error).toBeNull();
    expect(split).toEqual({ cash: 500, upi: 0, credit: 0 });
    expect(resolveSalePaymentType(split)).toBe('cash');
  });

  it('resolves split cash + upi', () => {
    const { split } = resolvePaymentSplit({
      paymentMode: 'split',
      paymentType: 'cash',
      payableTotal: 500,
      splitCash: 300,
      splitUpi: 200,
    });

    expect(split).toEqual({ cash: 300, upi: 200, credit: 0 });
    expect(resolveSalePaymentType(split)).toBe('partial');
  });

  it('resolves partial payment with udhaar remainder', () => {
    const { split } = resolvePaymentSplit({
      paymentMode: 'split',
      paymentType: 'cash',
      payableTotal: 1000,
      splitCash: 400,
      splitUpi: 100,
    });

    expect(split.credit).toBe(500);
    expect(resolveSalePaymentType(split)).toBe('partial');
  });

  it('requires customer for udhaar portion', () => {
    const error = validateCheckoutPayment({
      split: { cash: 200, upi: 0, credit: 300 },
      payableTotal: 500,
      hasCustomer: false,
    });

    expect(error).toContain('customer');
  });

  it('legacy sale payment split infers from payment_type', () => {
    expect(getSalePaymentSplit({
      payment_type: 'upi',
      total_amount: 99,
      cash_amount: 0,
      upi_amount: 0,
      credit_amount: 0,
    }).upi).toBe(99);
  });
});
