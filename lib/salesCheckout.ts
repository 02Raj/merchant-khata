export type SalePaymentType = 'cash' | 'upi' | 'credit' | 'partial';

export type PaymentSplit = {
  cash: number;
  upi: number;
  credit: number;
};

export function clampDiscount(discount: number, grandTotal: number): number {
  if (!Number.isFinite(discount) || discount <= 0) return 0;
  return Math.min(discount, Math.max(0, grandTotal));
}

export function computePayableTotal(grandTotal: number, discount: number): number {
  return Math.max(0, roundMoney(grandTotal - clampDiscount(discount, grandTotal)));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolvePaymentSplit(params: {
  paymentMode: 'simple' | 'split';
  paymentType: 'cash' | 'upi' | 'credit';
  payableTotal: number;
  splitCash: number;
  splitUpi: number;
}): { split: PaymentSplit; error: string | null } {
  const payableTotal = roundMoney(params.payableTotal);

  if (params.paymentMode === 'simple') {
    const split: PaymentSplit = { cash: 0, upi: 0, credit: 0 };
    if (params.paymentType === 'cash') split.cash = payableTotal;
    else if (params.paymentType === 'upi') split.upi = payableTotal;
    else split.credit = payableTotal;
    return { split, error: null };
  }

  const cash = roundMoney(Math.max(0, params.splitCash));
  const upi = roundMoney(Math.max(0, params.splitUpi));
  const credit = roundMoney(payableTotal - cash - upi);

  if (credit < 0) {
    return { split: { cash: 0, upi: 0, credit: 0 }, error: 'Cash + UPI cannot exceed bill total.' };
  }

  return { split: { cash, upi, credit }, error: null };
}

export function resolveSalePaymentType(split: PaymentSplit): SalePaymentType {
  const parts = [split.cash > 0, split.upi > 0, split.credit > 0].filter(Boolean).length;
  if (parts > 1) return 'partial';
  if (split.credit > 0) return 'credit';
  if (split.upi > 0) return 'upi';
  return 'cash';
}

export function formatPaymentModeLabel(split: PaymentSplit): string {
  const labels: string[] = [];
  if (split.cash > 0) labels.push(`Cash ₹${split.cash.toFixed(2)}`);
  if (split.upi > 0) labels.push(`UPI ₹${split.upi.toFixed(2)}`);
  if (split.credit > 0) labels.push(`Udhaar ₹${split.credit.toFixed(2)}`);
  return labels.join(' + ') || 'CASH';
}

export function validateCheckoutPayment(params: {
  split: PaymentSplit;
  payableTotal: number;
  hasCustomer: boolean;
}): string | null {
  const total = roundMoney(params.split.cash + params.split.upi + params.split.credit);
  if (total !== roundMoney(params.payableTotal)) {
    return 'Payment amounts must match bill total.';
  }
  if (params.split.credit > 0 && !params.hasCustomer) {
    return 'Select a customer for the udhaar portion.';
  }
  if (total <= 0) {
    return 'Bill total must be greater than zero.';
  }
  return null;
}

export function getSalePaymentSplit(sale: {
  payment_type: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  credit_amount: number;
}): PaymentSplit {
  if (sale.cash_amount > 0 || sale.upi_amount > 0 || sale.credit_amount > 0) {
    return {
      cash: sale.cash_amount,
      upi: sale.upi_amount,
      credit: sale.credit_amount,
    };
  }

  if (sale.payment_type === 'upi') return { cash: 0, upi: sale.total_amount, credit: 0 };
  if (sale.payment_type === 'credit') return { cash: 0, upi: 0, credit: sale.total_amount };
  return { cash: sale.total_amount, upi: 0, credit: 0 };
}
