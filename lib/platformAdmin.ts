import { supabase } from '@/lib/supabase';

export type PlatformOverview = {
  total_businesses: number;
  total_users: number;
  owners: number;
  staff: number;
  businesses_this_week: number;
  users_this_week: number;
};

export type PlatformBusinessType = 'retail' | 'wholesale' | 'both' | 'restaurant';

export const PLATFORM_BUSINESS_TYPES: {
  value: PlatformBusinessType;
  label: string;
  description: string;
}[] = [
  { value: 'retail', label: 'Retail', description: 'Counter billing, retail customers' },
  { value: 'wholesale', label: 'Wholesale', description: 'B2B bulk, wholesale pricing' },
  { value: 'both', label: 'Hybrid', description: 'Retail + wholesale in one shop' },
  { value: 'restaurant', label: 'Restaurant POS', description: 'Tables, KOT, waiter mode' },
];

export type PlatformBusiness = {
  id: string;
  name: string;
  owner_phone: string;
  business_type: string;
  address: string;
  created_at: string;
  user_count: number;
};

export type PlatformUser = {
  id: string;
  user_id: string;
  role: string;
  business_id: string;
  business_name: string;
  owner_phone: string;
  joined_at: string;
};

export const PLATFORM_OWNER_EMAIL =
  process.env.EXPO_PUBLIC_PLATFORM_OWNER_EMAIL ?? 'divyanshr243@gmail.com';

export const PLATFORM_OWNER_DEFAULT_PASSWORD =
  process.env.EXPO_PUBLIC_PLATFORM_OWNER_PASSWORD ?? 'OmniBill@123';

export async function checkPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_platform_admin');
  if (error) {
    console.warn('check_platform_admin failed:', error.message);
    return false;
  }
  return data === true;
}

export async function syncPlatformAdminUid(): Promise<void> {
  const { error } = await supabase.rpc('sync_platform_admin_uid');
  if (error) {
    throw error;
  }
}

export async function fetchPlatformOverview(): Promise<PlatformOverview | null> {
  const { data, error } = await supabase.rpc('get_platform_overview');
  if (error) {
    throw error;
  }
  return data as PlatformOverview | null;
}

export async function fetchPlatformBusinesses(): Promise<PlatformBusiness[]> {
  const { data, error } = await supabase.rpc('list_platform_businesses');
  if (error) {
    throw error;
  }
  return (data ?? []) as PlatformBusiness[];
}

export async function fetchPlatformUsers(): Promise<PlatformUser[]> {
  const { data, error } = await supabase.rpc('list_platform_users');
  if (error) {
    throw error;
  }
  return (data ?? []) as PlatformUser[];
}

export async function updatePlatformBusinessType(
  businessId: string,
  businessType: PlatformBusinessType,
): Promise<{ id: string; business_type: PlatformBusinessType }> {
  const { data, error } = await supabase.rpc('update_platform_business_type', {
    p_business_id: businessId,
    p_business_type: businessType,
  });
  if (error) {
    throw error;
  }
  const result = data as { id: string; business_type: string };
  return {
    id: result.id,
    business_type: result.business_type as PlatformBusinessType,
  };
}
