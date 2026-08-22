import { useEffect } from 'react';
import { LogBox, Text, View } from 'react-native';

LogBox.ignoreLogs([
  'Failed to initialize reCAPTCHA Enterprise config',
]);
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes cache
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

function RootNavigator() {
  const { isReady, session, hasBusiness } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;

    const group = segments[0];
    const screen = segments[1];

    if (!session) {
      const onLoginOrOtp = group === '(auth)' && (screen === 'login' || screen === 'otp');
      if (!onLoginOrOtp) {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (!hasBusiness) {
      if (screen !== 'business-setup') {
        router.replace('/(auth)/business-setup');
      }
      return;
    }

    if (group === '(auth)') {
      router.replace('/(tabs)/dashboard');
    }
  }, [hasBusiness, isReady, router, segments, session]);

  return (
    <>
      <StatusBar style="auto" />
      {!isReady ? (
        <View>
          <Text>Loading</Text>
        </View>
      ) : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}
