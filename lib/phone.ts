const INDIA_MOBILE = /^[6-9]\d{9}$/;

export function toE164India(raw: string): { ok: true; phone: string } | { ok: false; error: string } {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (!INDIA_MOBILE.test(digits)) {
    return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
  }

  return { ok: true, phone: `+91${digits}` };
}

export function formatIndiaDisplay(e164: string): string {
  if (e164.startsWith('+91') && e164.length === 13) {
    return `+91 ${e164.slice(3)}`;
  }
  return e164;
}
