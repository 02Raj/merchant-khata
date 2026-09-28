/**
 * AUTH_MODE controls which login methods are active.
 *
 * 'email_pin'  → Production default. Owner email/password + staff PIN. Zero SMS cost.
 * 'phone_otp'  → Legacy Firebase Phone OTP. Re-enable when a cheap SMS provider is wired.
 *
 * To re-enable phone OTP:
 *   1. Set AUTH_MODE = 'phone_otp'
 *   2. Enable Phone sign-in in Firebase Console
 *   3. Login / OTP screens already keep the legacy UI behind this flag
 */
export const AUTH_MODE = 'email_pin' as 'email_pin' | 'phone_otp';

export const isPhoneOtpEnabled = AUTH_MODE === 'phone_otp';
