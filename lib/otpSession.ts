type PendingOtp = {
  phone: string;
  verificationId: string;
};

/** PHONE_OTP_LEGACY — used only when AUTH_MODE is 'phone_otp'. */

let pending: PendingOtp | null = null;

export function setPendingOtp(next: PendingOtp) {
  pending = next;
}

export function getPendingOtp(): PendingOtp | null {
  return pending;
}

export function clearPendingOtp() {
  pending = null;
}
