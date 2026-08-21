import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

type ActivityItem = {
  id: string;
  type: 'sale' | 'payment';
  title: string;
  amount: number;
  time: Date;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { signOut, businessInfo } = useAuth();

  const [loading, setLoading] = useState(true);
  const [salesToday, setSalesToday] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [receivables, setReceivables] = useState(0);
  const [receivablesCount, setReceivablesCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  const fetchDashboardData = async () => {
    if (!businessInfo?.id) return;
    setLoading(true);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfTodayIso = today.toISOString();

      // 1. Fetch Today's Sales
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('total_amount')
        .eq('business_id', businessInfo.id)
        .gte('created_at', startOfTodayIso);

      if (!salesError && salesData) {
        const total = salesData.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
        setSalesToday(total);
        setSalesCount(salesData.length);
      }

      // 2. Fetch Receivables (Net Customer Balance = Debits - Credits)
      // Getting all ledger transactions for customers under this business
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('customer_id, amount, transaction_type')
        .eq('business_id', businessInfo.id)
        .not('customer_id', 'is', null);

      if (!ledgerError && ledgerData) {
        // Calculate balance per customer
        const balances: Record<string, number> = {};
        ledgerData.forEach(txn => {
          const cid = txn.customer_id as string;
          if (!balances[cid]) balances[cid] = 0;
          if (txn.transaction_type === 'debit') balances[cid] += Number(txn.amount);
          if (txn.transaction_type === 'credit') balances[cid] -= Number(txn.amount);
        });

        // Sum up positive balances (what customers owe us)
        let totalReceivables = 0;
        let countOwing = 0;
        Object.values(balances).forEach(bal => {
          if (bal > 0) {
            totalReceivables += bal;
            countOwing++;
          }
        });
        setReceivables(totalReceivables);
        setReceivablesCount(countOwing);
      }

      // 3. Fetch Low Stock
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          id, 
          low_stock_threshold,
          inventory_transactions (quantity_change)
        `)
        .eq('business_id', businessInfo.id)
        .eq('is_active', true);

      if (!productsError && productsData) {
        let lowStock = 0;
        productsData.forEach((p: any) => {
          const stock = p.inventory_transactions?.reduce((sum: number, txn: any) => sum + Number(txn.quantity_change), 0) || 0;
          const threshold = p.low_stock_threshold ? Number(p.low_stock_threshold) : 5;
          if (stock <= threshold) {
            lowStock++;
          }
        });
        setLowStockCount(lowStock);
      }

      // 4. Fetch Recent Activity (Last 5 Sales & Last 5 Payments)
      const { data: recentSales } = await supabase
        .from('sales')
        .select('id, total_amount, created_at, customer_id, customers(name)')
        .eq('business_id', businessInfo.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: recentPayments } = await supabase
        .from('payments')
        .select('id, amount, created_at, related_type, related_id')
        .eq('business_id', businessInfo.id)
        .eq('direction', 'received')
        .order('created_at', { ascending: false })
        .limit(5);

      const combined: ActivityItem[] = [];
      
      if (recentSales) {
        recentSales.forEach((s: any) => {
          combined.push({
            id: s.id,
            type: 'sale',
            title: s.customer_id && s.customers?.name ? `Sale to ${s.customers.name}` : `Retail Sale`,
            amount: Number(s.total_amount),
            time: new Date(s.created_at)
          });
        });
      }

      if (recentPayments) {
        recentPayments.forEach((p: any) => {
          combined.push({
            id: p.id,
            type: 'payment',
            title: 'Payment Received',
            amount: Number(p.amount),
            time: new Date(p.created_at)
          });
        });
      }

      // Sort combined by time descending and take top 5
      combined.sort((a, b) => b.time.getTime() - a.time.getTime());
      setRecentActivity(combined.slice(0, 5));

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [businessInfo])
  );

  const handleQuickAction = (route: string) => {
    router.push(route as any);
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDashboardData} tintColor={Colors.accent} />}
      >
        
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
            <Text style={styles.metricValuePrimary}>₹ {salesToday.toLocaleString('en-IN')}</Text>
            <Text style={styles.metricSubtitlePrimary}>{salesCount} transactions</Text>
          </View>

          <View style={styles.metricsRow}>
            {/* Udhaar Card */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <Ionicons name="wallet-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.metricTitle}>Receivables</Text>
              </View>
              <Text style={styles.metricValue}>₹ {receivables.toLocaleString('en-IN')}</Text>
              <Text style={styles.metricSubtitle}>{receivablesCount} customers</Text>
            </View>

            {/* Inventory Card */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.warn} />
                <Text style={styles.metricTitle}>Low Stock</Text>
              </View>
              <Text style={styles.metricValue}>{lowStockCount}</Text>
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

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.activityList}>
            {recentActivity.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: Colors.textSecondary }}>No recent activity</Text>
              </View>
            ) : (
              recentActivity.map((activity, index) => (
                <View key={activity.id + index} style={styles.activityItem}>
                  <View style={styles.activityIcon}>
                    <Ionicons 
                      name={activity.type === 'sale' ? "receipt-outline" : "wallet-outline"} 
                      size={20} 
                      color={Colors.textSecondary} 
                    />
                  </View>
                  <View style={styles.activityDetails}>
                    <Text style={styles.activityName}>{activity.title}</Text>
                    <Text style={styles.activityTime}>{getTimeAgo(activity.time)}</Text>
                  </View>
                  <Text style={styles.activityAmount}>+ ₹ {activity.amount.toLocaleString('en-IN')}</Text>
                </View>
              ))
            )}
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
