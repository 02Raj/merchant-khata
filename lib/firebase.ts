import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';
import { Platform } from 'react-native';

import { getFirebaseWebConfig } from '@/lib/firebaseConfig';

let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (auth) return auth;

  const config = getFirebaseWebConfig();
  const app = getApps().length > 0 ? getApp() : initializeApp(config);

  if (Platform.OS === 'web') {
    auth = getAuth(app);
    return auth;
  }

  try {
    const rnAuth = require('@firebase/auth') as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
    };
    auth = initializeAuth(app, {
      persistence: rnAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch {
    auth = getAuth(app);
  }

  return auth;
}
