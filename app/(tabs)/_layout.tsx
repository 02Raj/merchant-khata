import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';

const TAB_BAR_CONTENT_HEIGHT = 56;
// 3-button nav phones often report 0 inset without edge-to-edge; keep tabs above system buttons.
const ANDROID_NAV_FALLBACK = 48;

export default function TabsLayout() {
  const { businessInfo } = useAuth();
  const isRestaurant = businessInfo?.business_type === 'restaurant';
  const isWaiter = businessInfo?.role === 'waiter';
  const insets = useSafeAreaInsets();

  const bottomInset =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, ANDROID_NAV_FALLBACK)
      : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bg,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginBottom: Platform.OS === 'android' ? 2 : 0,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          href: isWaiter ? null : '/(tabs)/dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="tables"
        options={{
          title: 'Tables',
          href: isRestaurant ? '/(tabs)/tables' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="sales"
        options={{
          title: 'Sales',
          href: !isRestaurant && !isWaiter ? '/(tabs)/sales' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          href: isWaiter ? null : '/(tabs)/products',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          href: isWaiter ? null : '/(tabs)/customers',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="suppliers"
        options={{
          title: 'Suppliers',
          href: isWaiter ? null : '/(tabs)/suppliers',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bus" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          href: isWaiter ? null : '/(tabs)/inventory',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
