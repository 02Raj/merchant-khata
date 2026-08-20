import Constants from 'expo-constants';

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const PLACEHOLDER_MARKERS = [
  'YOUR_FIREBASE_API_KEY',
  'YOUR_FIREBASE_PROJECT_ID',
  'YOUR_FIREBASE_SENDER_ID',
  'YOUR_FIREBASE_APP_ID',
];

export function getFirebaseWebConfig(): FirebaseWebConfig {
  const extra = (Constants.expoConfig?.extra?.firebase ?? {}) as Partial<FirebaseWebConfig>;

  const config: FirebaseWebConfig = {
    apiKey: extra.apiKey?.trim() || process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || '',
    authDomain: extra.authDomain?.trim() || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || '',
    projectId: extra.projectId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || '',
    storageBucket: extra.storageBucket?.trim() || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || '',
    messagingSenderId:
      extra.messagingSenderId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
    appId: extra.appId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || '',
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase config (${missing.join(', ')}). Restart Expo with npx expo start -c.`);
  }

  const serialized = Object.values(config).join(' ');
  if (PLACEHOLDER_MARKERS.some((marker) => serialized.includes(marker))) {
    throw new Error('Firebase .env still has YOUR_FIREBASE_* dummy values.');
  }

  return config;
}
