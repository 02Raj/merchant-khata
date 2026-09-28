import { supabase } from '@/lib/supabase';

export type BusinessInfo = {
  id: string;
  name: string;
  owner_phone: string;
  address: string;
  gstin: string | null;
  fssai_number: string | null;
  business_type: 'retail' | 'wholesale' | 'both' | 'restaurant';
  role: 'owner' | 'staff' | 'waiter';
};

export async function signUpOwnerWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  return { session: data.user };
}

export async function signInOwnerWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return { session: data.user };
}

export async function sendOwnerPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

export function validateOwnerPassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/\d/.test(password)) return 'Include at least one number.';
  return null;
}

export function validateOwnerEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  return null;
}

/* ═══ PHONE_OTP_LEGACY — REMOVED ═══ */

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
        address,
        gstin,
        fssai_number,
        business_type
      )
    `)
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  const business = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses;

  if (!business) return null;

  return {
    id: business.id,
    name: business.name,
    owner_phone: business.owner_phone,
    address: business.address,
    gstin: business.gstin ?? null,
    fssai_number: business.fssai_number ?? null,
    business_type: business.business_type as 'retail' | 'wholesale' | 'both' | 'restaurant',
    role: data.role as 'owner' | 'staff' | 'waiter',
  };
}

const SUPABASE_ERROR_MESSAGES: Record<string, string> = {
  'User already registered': 'This email is already registered. Log in instead.',
  'Invalid login credentials': 'Wrong email or password.',
  'Password should be at least 6 characters': 'Password is too weak. Use at least 6 characters.',
};

export function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const mapped = SUPABASE_ERROR_MESSAGES[error.message];
    if (mapped) return mapped;
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
