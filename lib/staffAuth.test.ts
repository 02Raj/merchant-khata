import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { AUTH_MODE } from '@/lib/authConfig';
import {
  createdByActor,
  nextPinLockState,
  overlayBusinessRole,
  recordPinFailure,
  validateStaffName,
  validateStaffPin,
} from '@/lib/staffPin';

const ROOT = path.join(__dirname, '..');

describe('email_pin auth mode', () => {
  it('defaults to email_pin (no SMS)', () => {
    expect(AUTH_MODE).toBe('email_pin');
  });

  it('login is email-first; OTP route redirects unless flag is phone_otp', () => {
    const login = fs.readFileSync(path.join(ROOT, 'app/(auth)/login.tsx'), 'utf8');
    const otp = fs.readFileSync(path.join(ROOT, 'app/(auth)/otp.tsx'), 'utf8');
    expect(login).toContain('signInOwnerWithEmail');
    expect(login).toContain("AUTH_MODE === 'phone_otp'");
    expect(otp).toContain("AUTH_MODE !== 'phone_otp'");
    expect(otp).toContain("Redirect href=\"/(auth)/login\"");
  });

  it('preserves phone OTP implementation behind the flag', () => {
    const auth = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf8');
    expect(auth).toContain('PHONE_OTP_LEGACY');
    expect(auth).toContain('sendPhoneOtp');
    expect(auth).toContain('verifyPhoneOtp');
  });
});

  it('owner password rules live in lib/auth.ts', () => {
    const auth = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf8');
    expect(auth).toContain('validateOwnerPassword');
    expect(auth).toContain('password.length < 8');
    expect(auth).toContain('signUpOwnerWithEmail');
  });

  it('supports forgot and change password without SMS', () => {
    const auth = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf8');
    const login = fs.readFileSync(path.join(ROOT, 'app/(auth)/login.tsx'), 'utf8');
    const reset = fs.readFileSync(path.join(ROOT, 'app/(auth)/reset-password.tsx'), 'utf8');
    const settings = fs.readFileSync(path.join(ROOT, 'app/settings.tsx'), 'utf8');
    const rootLayout = fs.readFileSync(path.join(ROOT, 'app/_layout.tsx'), 'utf8');

    expect(auth).toContain('resetPasswordForEmail');
    expect(auth).toContain('exchangeCodeForSession');
    expect(auth).toContain("updateUser({ password })");
    expect(login).toContain('Send reset link');
    expect(reset).toContain('Save new password');
    expect(settings).toContain('Change password');
    expect(rootLayout).toContain("screenName === 'reset-password'");
  });

describe('staff PIN helpers', () => {
  it('rejects blank name and weak PINs', () => {
    expect(validateStaffName('')).not.toBeNull();
    expect(validateStaffPin('1234')).not.toBeNull();
    expect(validateStaffPin('12')).not.toBeNull();
    expect(validateStaffPin('4821')).toBeNull();
  });

  it('overlays waiter role without changing shop id', () => {
    const biz = {
      id: 'b1',
      role: 'owner' as const,
    };
    const overlaid = overlayBusinessRole(biz, { id: 's1', displayName: 'Raju', role: 'waiter' });
    expect(overlaid?.role).toBe('waiter');
    expect(overlaid?.id).toBe('b1');
  });

  it('tags created_by as staff when clocked in', () => {
    expect(createdByActor('uid-1', null)).toBe('uid-1');
    expect(createdByActor('uid-1', { id: 'abc', displayName: 'Raju', role: 'staff' })).toBe('staff:abc');
  });

  it('locks after 5 failures', () => {
    let state = { attempts: 0, lockedUntil: 0 };
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      state = recordPinFailure(state, now);
    }
    expect(state.lockedUntil).toBeGreaterThan(now);
    const gate = nextPinLockState(state, now + 1000);
    expect(gate.allowed).toBe(false);
  });
});
