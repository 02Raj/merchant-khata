import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';

import { userHasBusiness, type BusinessInfo } from '@/lib/auth';
import { checkPlatformAdmin } from '@/lib/platformAdmin';
import { getFirebaseAuth } from '@/lib/firebase';

type AuthSnapshot = {
  isReady: boolean;
  session: User | null;
  hasBusiness: boolean;
  businessInfo: BusinessInfo | null;
  isPlatformAdmin: boolean;
};

type AuthContextValue = AuthSnapshot & {
  refreshMembership: () => Promise<boolean>;
  refreshPlatformAdmin: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveAuthState(user: User | null) {
  if (!user?.uid) {
    return {
      hasBusiness: false,
      businessInfo: null as BusinessInfo | null,
      isPlatformAdmin: false,
    };
  }

  const [bizInfo, isPlatformAdmin] = await Promise.all([
    userHasBusiness(user.uid).catch(() => null),
    checkPlatformAdmin().catch(() => false),
  ]);

  return {
    hasBusiness: !!bizInfo,
    businessInfo: bizInfo,
    isPlatformAdmin,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSnapshot>({
    isReady: false,
    session: null,
    hasBusiness: false,
    businessInfo: null,
    isPlatformAdmin: false,
  });

  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};

    try {
      const firebaseAuth = getFirebaseAuth();
      if (typeof firebaseAuth.onAuthStateChanged !== 'function') {
        throw new Error('Firebase Auth did not initialize');
      }

      unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        const resolved = await resolveAuthState(user);
        if (!alive) return;
        setAuth({
          isReady: true,
          session: user,
          ...resolved,
        });
      });
    } catch (error) {
      console.error('Firebase auth setup failed:', error);
      if (alive) {
        setAuth({
          isReady: true,
          session: null,
          hasBusiness: false,
          businessInfo: null,
          isPlatformAdmin: false,
        });
      }
    }

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...auth,
      refreshMembership: async () => {
        const userId = auth.session?.uid;
        if (!userId) {
          setAuth((prev) => ({ ...prev, hasBusiness: false, businessInfo: null }));
          return false;
        }
        const bizInfo = await userHasBusiness(userId);
        setAuth((prev) => ({ ...prev, hasBusiness: !!bizInfo, businessInfo: bizInfo }));
        return !!bizInfo;
      },
      refreshPlatformAdmin: async () => {
        const isPlatformAdmin = await checkPlatformAdmin();
        setAuth((prev) => ({ ...prev, isPlatformAdmin }));
        return isPlatformAdmin;
      },
      signOut: async () => {
        await getFirebaseAuth().signOut();
        setAuth({
          isReady: true,
          session: null,
          hasBusiness: false,
          businessInfo: null,
          isPlatformAdmin: false,
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
