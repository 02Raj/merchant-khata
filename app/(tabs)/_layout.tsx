import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';

export default function TabsLayout() {
  const { businessInfo } = useAuth();
  const isRestaurant = businessInfo?.business_type === 'restaurant';
  const isWaiter = businessInfo?.role === 'waiter';

  return (
    <Tabs
      screenOptions={{
        headerShown: false, // We will build custom headers in the screens
        tabBarStyle: {
          backgroundColor: Colors.bg,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
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
      
      {/* Restaurant Mode: Show Tables */}
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

      {/* Retail/Wholesale Mode: Show Sales */}
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
