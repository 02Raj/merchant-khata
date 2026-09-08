import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import { HIDE_RESTAURANT_LAUNCH_EXTRAS } from '@/lib/restaurantHelpers';

const TAB_BAR_CONTENT_HEIGHT = 56;
// 3-button nav phones often report 0 inset without edge-to-edge; keep tabs above system buttons.
const ANDROID_NAV_FALLBACK = 48;

export default function TabsLayout() {
  const { businessInfo } = useAuth();
  const isRestaurant = businessInfo?.business_type === 'restaurant';
  const isWaiter = businessInfo?.role === 'waiter';
  const hideRestaurantExtras = isRestaurant && HIDE_RESTAURANT_LAUNCH_EXTRAS;
  const insets = useSafeAreaInsets();

  const bottomInset =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, 8) // use a small fallback instead of 48
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
          title: 'Bill',
          href: !isRestaurant && !isWaiter ? '/(tabs)/sales' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="products"
        options={{
          title: isRestaurant ? 'Menu' : 'Items',
          href: isWaiter ? null : '/(tabs)/products',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Khata',
          // Restaurant: party ledger is post-MVP. Screen kept for a later toggle.
          href: isWaiter || hideRestaurantExtras ? null : '/(tabs)/customers',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="suppliers"
        options={{
          title: 'Suppliers',
          // Merchant stock-in lives on Home. Restaurant suppliers are post-MVP.
          href: isWaiter || isRestaurant ? null : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bus" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          // Restaurant raw materials / recipes stay in code (inventory.tsx) for later.
          href: isWaiter ? null : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
