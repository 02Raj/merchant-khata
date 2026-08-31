import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useEffect } from 'react';
import { LogBox, Platform, Text, View } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

LogBox.ignoreLogs([
  'Failed to initialize reCAPTCHA Enterprise config',
]);
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!isReady || !rootNavigationState?.key) return;

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
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void NavigationBar.setBackgroundColorAsync('#ffffff');
    void NavigationBar.setButtonStyleAsync('dark');
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
