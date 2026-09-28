export type StaffProfile = {
  id: string;
  displayName: string;
  role: 'staff' | 'waiter';
};

export type StaffRow = {
  id: string;
  display_name: string;
  role: 'staff' | 'waiter';
  is_active: boolean;
};

const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '0123', '12345', '123456', '654321', '1122', '1212', '1000', '0001',
]);

export function validateStaffPin(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) {
    return 'PIN must be 4–6 digits.';
  }
  if (WEAK_PINS.has(pin)) {
    return 'Choose a less obvious PIN.';
  }
  return null;
}

export function validateStaffName(name: string): string | null {
  if (!name.trim()) return 'Enter a name.';
  return null;
}

export function createdByActor(sessionUid: string | undefined, staff: StaffProfile | null): string {
  if (staff?.id) return `staff:${staff.id}`;
  return sessionUid || 'owner';
}

export function overlayBusinessRole<T extends { role: 'owner' | 'staff' | 'waiter' }>(
  business: T | null,
  staff: StaffProfile | null,
): T | null {
  if (!business) return null;
  if (!staff) return business;
  return { ...business, role: staff.role };
}

const LOCK_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type PinLockState = { attempts: number; lockedUntil: number };

export function nextPinLockState(prev: PinLockState | null, now = Date.now()): {
  allowed: boolean;
  state: PinLockState;
  message?: string;
} {
  const current = prev ?? { attempts: 0, lockedUntil: 0 };
  if (current.lockedUntil > now) {
    const mins = Math.max(1, Math.ceil((current.lockedUntil - now) / 60000));
    return {
      allowed: false,
      state: current,
      message: `Too many attempts. Try again in ${mins} min.`,
    };
  }
  return { allowed: true, state: current.lockedUntil ? { attempts: 0, lockedUntil: 0 } : current };
}

export function recordPinFailure(prev: PinLockState, now = Date.now()): PinLockState {
  const attempts = prev.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return { attempts: 0, lockedUntil: now + LOCK_MS };
  }
  return { attempts, lockedUntil: 0 };
}
