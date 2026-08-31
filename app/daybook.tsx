import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { aggregateDaybookSales } from '@/lib/daybookCalc';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';

export default function DayBookScreen() {
  const router = useRouter();
  const { businessInfo } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [metrics, setMetrics] = useState({
    totalSales: 0,
    cashSales: 0,
    upiSales: 0,
    creditSales: 0,
    cashRecovered: 0,
    upiRecovered: 0,
    cashExpenses: 0,
    netCashInDrawer: 0
  });

  useEffect(() => {
    fetchDayBook();
  }, [businessInfo]);

  const fetchDayBook = async (isRefreshing = false) => {
    if (!businessInfo?.id) return;
    if (!isRefreshing) setLoading(true);

    try {
      // Get start and end of today in local time
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch Today's Sales
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('total_amount, payment_type, cash_amount, upi_amount, credit_amount')
        .eq('business_id', businessInfo.id)
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      if (salesError) throw salesError;

      // Fetch Today's Payments (Khata Recoveries)
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, method')
        .eq('business_id', businessInfo.id)
        .eq('direction', 'received')
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      if (paymentsError) throw paymentsError;

      // Fetch Today's Expenses
      let expensesData: any[] = [];
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('amount, payment_method')
          .eq('business_id', businessInfo.id)
          .gte('created_at', today.toISOString())
          .lt('created_at', tomorrow.toISOString());
        
        if (!error && data) {
          expensesData = data;
        }
      } catch (err) {
        // Ignored if table doesn't exist yet
      }

      // Calculate Metrics
      const salesAgg = aggregateDaybookSales(sales || []);
      let cashSales = salesAgg.cashSales;
      let upiSales = salesAgg.upiSales;
      let creditSales = salesAgg.creditSales;

      let cashRecovered = 0;
      let upiRecovered = 0;

      payments?.forEach(p => {
        const amt = Number(p.amount);
        if (p.method === 'cash') cashRecovered += amt;
        else if (p.method === 'upi') upiRecovered += amt;
      });

      let cashExpenses = 0;
      expensesData.forEach((e: any) => {
        const amt = Number(e.amount);
        if (e.payment_method === 'cash') cashExpenses += amt;
      });

      setMetrics({
        totalSales: cashSales + upiSales + creditSales,
        cashSales,
        upiSales,
        creditSales,
        cashRecovered,
        upiRecovered,
        cashExpenses,
        netCashInDrawer: (cashSales + cashRecovered) - cashExpenses
      });

    } catch (error) {
      console.error('Failed to fetch day book:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Day Book</Text>
          <Text style={styles.subtitle}>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <ScrollView 
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDayBook(true); }} tintColor={Colors.accent} />}
        >
          {/* Main Galla Alert */}
          <View style={styles.drawerCard}>
            <Text style={styles.drawerLabel}>Expected Cash In Drawer</Text>
            <Text style={styles.drawerAmount}>₹ {metrics.netCashInDrawer.toLocaleString('en-IN')}</Text>
            <Text style={styles.drawerSubtext}>Check this amount before closing the shop</Text>
          </View>

          <Text style={styles.sectionTitle}>Today's Sales Breakdown</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}><Ionicons name="cash" size={20} color={Colors.ok} /></View>
              <Text style={styles.rowLabel}>Cash Sales</Text>
              <Text style={styles.rowValue}>₹ {metrics.cashSales.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(59,130,246,0.1)' }]}><Ionicons name="phone-portrait" size={20} color="#3B82F6" /></View>
              <Text style={styles.rowLabel}>UPI / Online</Text>
              <Text style={styles.rowValue}>₹ {metrics.upiSales.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}><Ionicons name="book" size={20} color="#EF4444" /></View>
              <Text style={styles.rowLabel}>Udhaar (Credit) Sales</Text>
              <Text style={styles.rowValue}>₹ {metrics.creditSales.toLocaleString('en-IN')}</Text>
            </View>
            
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Sales</Text>
              <Text style={styles.totalValue}>₹ {metrics.totalSales.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Khata Recovery (Money Received)</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}><Ionicons name="cash-outline" size={20} color={Colors.ok} /></View>
              <Text style={styles.rowLabel}>Cash Received</Text>
              <Text style={styles.rowValue}>₹ {metrics.cashRecovered.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(59,130,246,0.1)' }]}><Ionicons name="phone-portrait-outline" size={20} color="#3B82F6" /></View>
              <Text style={styles.rowLabel}>UPI Received</Text>
              <Text style={styles.rowValue}>₹ {metrics.upiRecovered.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Expenses & Outflows</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}><Ionicons name="receipt" size={20} color={Colors.warn} /></View>
              <Text style={styles.rowLabel}>Cash Expenses (Deducted)</Text>
              <Text style={[styles.rowValue, { color: Colors.warn }]}>- ₹ {metrics.cashExpenses.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 8, marginLeft: -8, width: 40 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  content: { flex: 1, padding: 16 },
  
  drawerCard: { backgroundColor: Colors.accent, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 32, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  drawerLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  drawerAmount: { fontSize: 40, color: '#fff', fontWeight: '800', marginBottom: 8 },
  drawerSubtext: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },

  sectionTitle: { fontSize: 13, textTransform: 'uppercase', color: Colors.textSecondary, fontWeight: '600', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 24 },
  
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(34,197,94,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  rowLabel: { flex: 1, fontSize: 16, color: Colors.textPrimary, fontWeight: '500' },
  rowValue: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  totalValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
});
