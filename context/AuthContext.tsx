import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';

import { userHasBusiness, type BusinessInfo } from '@/lib/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type AuthSnapshot = {
  isReady: boolean;
  session: User | null;
  hasBusiness: boolean;
  businessInfo: BusinessInfo | null;
};

type AuthContextValue = AuthSnapshot & {
  refreshMembership: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSnapshot>({
    isReady: false,
    session: null,
    hasBusiness: false,
    businessInfo: null,
  });

  useEffect(() => {
    let alive = true;

    const auth = getFirebaseAuth();
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      let bizInfo: BusinessInfo | null = null;
      if (user?.uid) {
        try {
          bizInfo = await userHasBusiness(user.uid);
        } catch {
          bizInfo = null;
        }
      }
      if (!alive) return;
      setAuth({ 
        isReady: true, 
        session: user, 
        hasBusiness: !!bizInfo, 
        businessInfo: bizInfo 
      });
    });

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
      signOut: async () => {
        await getFirebaseAuth().signOut();
        setAuth({ isReady: true, session: null, hasBusiness: false, businessInfo: null });
      }
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
