export type BusinessType = 'retail' | 'wholesale' | 'both' | 'restaurant';

export type CreditLimitEvaluation = {
  applies: boolean;
  exceeded: boolean;
  currentBalance: number;
  creditLimit: number | null;
  projectedBalance: number;
  message: string | null;
};

export function formatPhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

export function buildUdhaarReminderMessage(params: {
  customerName: string;
  balance: number;
  businessName: string;
}): string {
  const amount = Math.max(0, params.balance);
  const formatted = amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return (
    `Namaste ${params.customerName},\n\n` +
    `Aapka pending udhaar *₹${formatted}* hai at ${params.businessName}.\n` +
    `Kripya jaldi payment kar dein.\n\n` +
    `Dhanyavaad,\n${params.businessName}`
  );
}

export function usesCreditLimit(businessType: BusinessType | string | undefined): boolean {
  return businessType === 'wholesale' || businessType === 'both';
}

export function evaluateCreditLimit(params: {
  businessType: BusinessType | string | undefined;
  currentBalance: number;
  creditLimit: number | null | undefined;
  billAmount: number;
  paymentType: 'cash' | 'upi' | 'card' | 'credit';
}): CreditLimitEvaluation {
  const applies = usesCreditLimit(params.businessType) && params.paymentType === 'credit';

  if (!applies) {
    return {
      applies: false,
      exceeded: false,
      currentBalance: params.currentBalance,
      creditLimit: params.creditLimit ?? null,
      projectedBalance: params.currentBalance,
      message: null,
    };
  }

  const limit = params.creditLimit ?? null;
  const projectedBalance = params.currentBalance + Math.max(0, params.billAmount);

  if (limit == null || limit <= 0) {
    return {
      applies: true,
      exceeded: false,
      currentBalance: params.currentBalance,
      creditLimit: limit,
      projectedBalance,
      message: null,
    };
  }

  const exceeded = projectedBalance > limit;
  const message = exceeded
    ? `Credit limit ₹${limit.toLocaleString('en-IN')} exceeded. New balance will be ₹${projectedBalance.toLocaleString('en-IN')}.`
    : null;

  return {
    applies: true,
    exceeded,
    currentBalance: params.currentBalance,
    creditLimit: limit,
    projectedBalance,
    message,
  };
}

export function parseCreditLimitInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}
