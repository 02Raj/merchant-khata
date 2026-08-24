import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { Platform } from 'react-native';

function requirePublicEnv(
  name: 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
): string {
  const value =
    (name === 'EXPO_PUBLIC_SUPABASE_URL'
      ? process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wryyfshcwrrenwrhlakj.supabase.co'
      : process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_x-000hfvC_XczyqG0iv9Og_T6oJpV-k')?.trim();

  return value || '';
}

const isWebServer = Platform.OS === 'web' && typeof window === 'undefined';

const authStorage: SupportedStorage = {
  getItem: (key) => {
    if (isWebServer) return Promise.resolve(null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (isWebServer) return Promise.resolve();
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (isWebServer) return Promise.resolve();
    return AsyncStorage.removeItem(key);
  },
};

if (typeof globalThis.WebSocket === 'undefined') {
  // Node (Expo CLI tooling) has no WebSocket. Expo Go / simulators do.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = class {
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  };
}

import { getFirebaseAuth } from './firebase';

const supabaseUrl = requirePublicEnv('EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = requirePublicEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: !isWebServer,
    persistSession: !isWebServer,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      // Any additional headers could go here if needed
    },
  },
  accessToken: async () => {
    try {
      const auth = getFirebaseAuth();
      return (await auth.currentUser?.getIdToken(false)) ?? '';
    } catch {
      return '';
    }
  },
});
