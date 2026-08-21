import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/lib/theme';

export default function DashboardScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const handleQuickAction = (route: string) => {
    // Navigate to the respective screen
    // Note: Some of these might be modals in the future
    router.push(route as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Overview</Text>
            <Text style={styles.title}>Merchant Dashboard</Text>
          </View>
          <TouchableOpacity onPress={() => signOut()} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.metricsGrid}>
          {/* Sales Card */}
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <View style={styles.metricHeader}>
              <Ionicons name="trending-up" size={20} color={Colors.textPrimary} />
              <Text style={styles.metricTitlePrimary}>Today's Sales</Text>
            </View>
            <Text style={styles.metricValuePrimary}>₹ 4,500</Text>
            <Text style={styles.metricSubtitlePrimary}>12 transactions</Text>
          </View>

          <View style={styles.metricsRow}>
            {/* Udhaar Card */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <Ionicons name="wallet-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.metricTitle}>Receivables</Text>
              </View>
              <Text style={styles.metricValue}>₹ 1,200</Text>
              <Text style={styles.metricSubtitle}>3 customers</Text>
            </View>

            {/* Inventory Card */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.warn} />
                <Text style={styles.metricTitle}>Low Stock</Text>
              </View>
              <Text style={styles.metricValue}>14</Text>
              <Text style={styles.metricSubtitle}>items need refill</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleQuickAction('/(tabs)/sales')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(138, 163, 106, 0.15)' }]}>
                <Ionicons name="cart" size={24} color={Colors.ok} />
              </View>
              <Text style={styles.actionText}>New Sale</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleQuickAction('/(tabs)/products')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: Colors.accentDim }]}>
                <Ionicons name="add-circle" size={24} color={Colors.accent} />
              </View>
              <Text style={styles.actionText}>Add Product</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleQuickAction('/(tabs)/customers')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(201, 162, 39, 0.15)' }]}>
                <Ionicons name="cash" size={24} color={Colors.warn} />
              </View>
              <Text style={styles.actionText}>Payment In</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Activity (Placeholder) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.activityList}>
            <View style={styles.activityItem}>
              <View style={styles.activityIcon}>
                <Ionicons name="receipt-outline" size={20} color={Colors.textSecondary} />
              </View>
              <View style={styles.activityDetails}>
                <Text style={styles.activityName}>Sale #1042</Text>
                <Text style={styles.activityTime}>10 mins ago</Text>
              </View>
              <Text style={styles.activityAmount}>+ ₹ 350</Text>
            </View>

            <View style={styles.activityItem}>
              <View style={styles.activityIcon}>
                <Ionicons name="wallet-outline" size={20} color={Colors.textSecondary} />
              </View>
              <View style={styles.activityDetails}>
                <Text style={styles.activityName}>Payment from Rahul</Text>
                <Text style={styles.activityTime}>1 hour ago</Text>
              </View>
              <Text style={styles.activityAmount}>+ ₹ 500</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  logoutBtn: {
    padding: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.accentInk,
    marginBottom: 6,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  metricsGrid: {
    gap: 12,
    marginBottom: 32,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricCardPrimary: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  metricTitlePrimary: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  metricTitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  metricValuePrimary: {
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  metricValue: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  metricSubtitlePrimary: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
  },
  metricSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  seeAllText: {
    color: Colors.accentInk,
    fontSize: 14,
    fontWeight: '500',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  activityList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityDetails: {
    flex: 1,
  },
  activityName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  activityTime: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  activityAmount: {
    color: Colors.ok,
    fontSize: 16,
    fontWeight: '600',
  },
});

