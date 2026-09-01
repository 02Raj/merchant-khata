import { Redirect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { isReady, session, hasBusiness, businessInfo } = useAuth();

  if (!isReady) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!hasBusiness) {
    return <Redirect href="/(auth)/business-setup" />;
  }

  if (businessInfo?.role === 'waiter' && businessInfo?.business_type === 'restaurant') {
    return <Redirect href="/(tabs)/tables" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}
