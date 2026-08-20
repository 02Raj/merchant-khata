type PendingOtp = {
  phone: string;
  verificationId: string;
};

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
