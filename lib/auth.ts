import {
  PhoneAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  type ApplicationVerifier,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/lib/firebase';
import { clearPendingOtp, getPendingOtp, setPendingOtp } from '@/lib/otpSession';
import { supabase } from '@/lib/supabase';

export type BusinessInfo = {
  id: string;
  name: string;
  owner_phone: string;
  business_type: 'retail' | 'wholesale' | 'both' | 'restaurant';
  role: 'owner' | 'staff' | 'waiter';
};

export async function sendPhoneOtp(phone: string, verifier: ApplicationVerifier) {
  const auth = getFirebaseAuth();
  const provider = new PhoneAuthProvider(auth);
  const verificationId = await provider.verifyPhoneNumber(phone, verifier);
  setPendingOtp({ phone, verificationId });
}

export async function signInOwnerWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return { session: result.user };
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

export async function userHasBusiness(userId: string): Promise<BusinessInfo | null> {
  const { data, error } = await supabase
    .from('business_users')
    .select(`
      business_id,
      role,
      businesses (
        id,
        name,
        owner_phone,
        business_type
      )
    `)
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  // The inner join returns businesses as an object or array depending on relation setup,
  // but since business_users -> businesses is a Many-to-One, it returns a single object.
  const business = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses;
  
  if (!business) return null;

  return {
    id: business.id,
    name: business.name,
    owner_phone: business.owner_phone,
    business_type: business.business_type as 'retail' | 'wholesale' | 'both' | 'restaurant',
    role: data.role as 'owner' | 'staff' | 'waiter',
  };
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
