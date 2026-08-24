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
    apiKey: extra.apiKey?.trim() || process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || 'AIzaSyBmlJYSQPcyNP0332P3Y7pSLe4wRUCkZwE',
    authDomain: extra.authDomain?.trim() || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || 'clinic-desk-os.firebaseapp.com',
    projectId: extra.projectId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || 'clinic-desk-os',
    storageBucket: extra.storageBucket?.trim() || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || 'clinic-desk-os.firebasestorage.app',
    messagingSenderId:
      extra.messagingSenderId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || '1022948349139',
    appId: extra.appId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || '1:1022948349139:web:862f98b7c741920cd23026',
  };

  return config;
}
