import {
  PhoneAuthProvider,
  signInWithCredential,
  type ApplicationVerifier,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/lib/firebase';
import { clearPendingOtp, getPendingOtp, setPendingOtp } from '@/lib/otpSession';
import { supabase } from '@/lib/supabase';

export async function sendPhoneOtp(phone: string, verifier: ApplicationVerifier) {
  const auth = getFirebaseAuth();
  const provider = new PhoneAuthProvider(auth);
  const verificationId = await provider.verifyPhoneNumber(phone, verifier);
  setPendingOtp({ phone, verificationId });
}

export async function verifyPhoneOtp(token: string) {
  const pending = getPendingOtp();
  if (!pending) {
    throw new Error('No OTP in progress. Go back and send a new code.');
  }

  const auth = getFirebaseAuth();
  const credential = PhoneAuthProvider.credential(pending.verificationId, token);
  const result = await signInWithCredential(auth, credential);

  clearPendingOtp();
  return { session: result.user };
}

export async function userHasBusiness(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('business_users')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
