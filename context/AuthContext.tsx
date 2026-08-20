import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';

import { userHasBusiness } from '@/lib/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type AuthSnapshot = {
  isReady: boolean;
  session: User | null;
  hasBusiness: boolean;
};

type AuthContextValue = AuthSnapshot & {
  refreshMembership: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSnapshot>({
    isReady: false,
    session: null,
    hasBusiness: false,
  });

  useEffect(() => {
    let alive = true;

    const auth = getFirebaseAuth();
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      let hasBusiness = false;
      if (user?.uid) {
        try {
          hasBusiness = await userHasBusiness(user.uid);
        } catch {
          hasBusiness = false;
        }
      }
      if (!alive) return;
      setAuth({ isReady: true, session: user, hasBusiness });
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
          setAuth((prev) => ({ ...prev, hasBusiness: false }));
          return false;
        }
        const hasBusiness = await userHasBusiness(userId);
        setAuth((prev) => ({ ...prev, hasBusiness }));
        return hasBusiness;
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
