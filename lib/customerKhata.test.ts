import { describe, expect, it } from '@jest/globals';

import {
  buildUdhaarReminderMessage,
  evaluateCreditLimit,
  formatPhoneForWhatsApp,
  parseCreditLimitInput,
  usesCreditLimit,
} from './customerKhata';

describe('formatPhoneForWhatsApp', () => {
  it('prefixes 91 for 10-digit Indian numbers', () => {
    expect(formatPhoneForWhatsApp('9876543210')).toBe('919876543210');
  });

  it('keeps numbers that already include country code', () => {
    expect(formatPhoneForWhatsApp('+91 98765 43210')).toBe('919876543210');
  });

  it('returns null for invalid short numbers', () => {
    expect(formatPhoneForWhatsApp('N/A')).toBeNull();
    expect(formatPhoneForWhatsApp('12345')).toBeNull();
  });
});

describe('buildUdhaarReminderMessage', () => {
  it('includes customer name, amount, and shop name', () => {
    const message = buildUdhaarReminderMessage({
      customerName: 'Ramesh',
      balance: 1500,
      businessName: 'Sharma Kirana',
    });

    expect(message).toContain('Ramesh');
    expect(message).toContain('₹1,500');
    expect(message).toContain('Sharma Kirana');
  });
});

describe('usesCreditLimit', () => {
  it('applies only to wholesale and hybrid shops', () => {
    expect(usesCreditLimit('wholesale')).toBe(true);
    expect(usesCreditLimit('both')).toBe(true);
    expect(usesCreditLimit('retail')).toBe(false);
    expect(usesCreditLimit('restaurant')).toBe(false);
  });
});

describe('evaluateCreditLimit', () => {
  it('ignores credit limit for retail businesses', () => {
    const result = evaluateCreditLimit({
      businessType: 'retail',
      currentBalance: 5000,
      creditLimit: 1000,
      billAmount: 500,
      paymentType: 'credit',
    });

    expect(result.applies).toBe(false);
    expect(result.exceeded).toBe(false);
  });

  it('does not flag cash sales for wholesale', () => {
    const result = evaluateCreditLimit({
      businessType: 'wholesale',
      currentBalance: 9000,
      creditLimit: 10000,
      billAmount: 2000,
      paymentType: 'cash',
    });

    expect(result.applies).toBe(false);
    expect(result.exceeded).toBe(false);
  });

  it('allows udhaar within credit limit', () => {
    const result = evaluateCreditLimit({
      businessType: 'wholesale',
      currentBalance: 2000,
      creditLimit: 10000,
      billAmount: 3000,
      paymentType: 'credit',
    });

    expect(result.applies).toBe(true);
    expect(result.exceeded).toBe(false);
    expect(result.projectedBalance).toBe(5000);
  });

  it('flags udhaar that crosses credit limit', () => {
    const result = evaluateCreditLimit({
      businessType: 'both',
      currentBalance: 8000,
      creditLimit: 10000,
      billAmount: 3000,
      paymentType: 'credit',
    });

    expect(result.exceeded).toBe(true);
    expect(result.message).toContain('Credit limit');
    expect(result.projectedBalance).toBe(11000);
  });

  it('treats empty credit limit as unlimited', () => {
    const result = evaluateCreditLimit({
      businessType: 'wholesale',
      currentBalance: 50000,
      creditLimit: null,
      billAmount: 10000,
      paymentType: 'credit',
    });

    expect(result.applies).toBe(true);
    expect(result.exceeded).toBe(false);
  });
});

describe('parseCreditLimitInput', () => {
  it('parses valid numbers', () => {
    expect(parseCreditLimitInput('10000')).toBe(10000);
    expect(parseCreditLimitInput(' 5000 ')).toBe(5000);
  });

  it('returns null for blank or invalid values', () => {
    expect(parseCreditLimitInput('')).toBeNull();
    expect(parseCreditLimitInput('abc')).toBeNull();
    expect(parseCreditLimitInput('-5')).toBeNull();
  });
});
