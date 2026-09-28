import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { userHasBusiness, type BusinessInfo } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { overlayBusinessRole, type StaffProfile } from '@/lib/staffPin';

type AuthSnapshot = {
  isReady: boolean;
  session: User | null;
  hasBusiness: boolean;
  membership: BusinessInfo | null;
  businessInfo: BusinessInfo | null;
  activeStaff: StaffProfile | null;
};

type AuthContextValue = AuthSnapshot & {
  refreshMembership: () => Promise<boolean>;
  setActiveStaff: (staff: StaffProfile | null) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function staffStorageKey(uid: string, businessId: string) {
  return `omnibill:activeStaff:${uid}:${businessId}`;
}

async function loadStoredStaff(uid: string, businessId: string): Promise<StaffProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(staffStorageKey(uid, businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffProfile;
    if (!parsed?.id || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSnapshot>({
    isReady: false,
    session: null,
    hasBusiness: false,
    membership: null,
    businessInfo: null,
    activeStaff: null,
  });

  useEffect(() => {
    let alive = true;

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          const user = session?.user ?? null;
          let membership: BusinessInfo | null = null;
          let staff: StaffProfile | null = null;
          
          if (user?.id) {
            try {
              membership = await userHasBusiness(user.id);
              if (membership?.id) {
                staff = await loadStoredStaff(user.id, membership.id);
              }
            } catch {
              membership = null;
            }
          }
          if (!alive) return;
          setAuth({
            isReady: true,
            session: user,
            hasBusiness: !!membership,
            membership,
            businessInfo: overlayBusinessRole(membership, staff),
            activeStaff: staff,
          });
        }
      );

      return () => {
        alive = false;
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error('Supabase auth setup failed:', error);
      if (alive) {
        setAuth({
          isReady: true,
          session: null,
          hasBusiness: false,
          membership: null,
          businessInfo: null,
          activeStaff: null,
        });
      }
      return () => {
        alive = false;
      };
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...auth,
      refreshMembership: async () => {
        const userId = auth.session?.id;
        if (!userId) {
          setAuth((prev) => ({
            ...prev,
            hasBusiness: false,
            membership: null,
            businessInfo: null,
            activeStaff: null,
          }));
          return false;
        }
        const membership = await userHasBusiness(userId);
        let staff = auth.activeStaff;
        if (membership?.id) {
          staff = await loadStoredStaff(userId, membership.id);
        } else {
          staff = null;
        }
        setAuth((prev) => ({
          ...prev,
          hasBusiness: !!membership,
          membership,
          businessInfo: overlayBusinessRole(membership, staff),
          activeStaff: staff,
        }));
        return !!membership;
      },
      setActiveStaff: async (staff) => {
        const uid = auth.session?.id;
        const businessId = auth.membership?.id;
        if (uid && businessId) {
          const key = staffStorageKey(uid, businessId);
          if (staff) {
            await AsyncStorage.setItem(key, JSON.stringify(staff));
          } else {
            await AsyncStorage.removeItem(key);
          }
        }
        setAuth((prev) => ({
          ...prev,
          activeStaff: staff,
          businessInfo: overlayBusinessRole(prev.membership, staff),
        }));
      },
      signOut: async () => {
        const uid = auth.session?.id;
        const businessId = auth.membership?.id;
        if (uid && businessId) {
          await AsyncStorage.removeItem(staffStorageKey(uid, businessId));
        }
        await supabase.auth.signOut();
        setAuth({
          isReady: true,
          session: null,
          hasBusiness: false,
          membership: null,
          businessInfo: null,
          activeStaff: null,
        });
      },
    }),
    [auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
