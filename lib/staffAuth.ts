import { supabase } from '@/lib/supabase';
import {
  validateStaffName,
  validateStaffPin,
  type StaffProfile,
  type StaffRow,
} from '@/lib/staffPin';

export type { StaffProfile, StaffRow } from '@/lib/staffPin';
export {
  createdByActor,
  overlayBusinessRole,
  nextPinLockState,
  recordPinFailure,
  validateStaffName,
  validateStaffPin,
} from '@/lib/staffPin';
export type { PinLockState } from '@/lib/staffPin';

export async function listStaffProfiles(businessId: string): Promise<StaffRow[]> {
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, display_name, role, is_active')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StaffRow[];
}

export async function createStaffProfile(params: {
  businessId: string;
  displayName: string;
  role: 'staff' | 'waiter';
  pin: string;
}): Promise<string> {
  const nameError = validateStaffName(params.displayName);
  if (nameError) throw new Error(nameError);
  const pinError = validateStaffPin(params.pin);
  if (pinError) throw new Error(pinError);

  const { data, error } = await supabase.rpc('create_staff_profile', {
    p_business_id: params.businessId,
    p_display_name: params.displayName.trim(),
    p_role: params.role,
    p_pin: params.pin,
  });
  if (error) throw error;
  return data as string;
}

export async function setStaffActive(staffId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_staff_profile_active', {
    p_staff_id: staffId,
    p_is_active: isActive,
  });
  if (error) throw error;
}

export async function updateStaffPin(staffId: string, pin: string): Promise<void> {
  const pinError = validateStaffPin(pin);
  if (pinError) throw new Error(pinError);
  const { error } = await supabase.rpc('update_staff_pin', {
    p_staff_id: staffId,
    p_pin: pin,
  });
  if (error) throw error;
}

export async function verifyStaffPin(businessId: string, pin: string): Promise<StaffProfile> {
  const { data, error } = await supabase.rpc('verify_staff_pin', {
    p_business_id: businessId,
    p_pin: pin,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Invalid PIN');
  return {
    id: row.staff_id,
    displayName: row.display_name,
    role: row.role,
  };
}
