import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';
import { Skeleton } from '@/components/Skeleton';
import { useDashboardMetrics } from '@/hooks/useQueries';

export default function DashboardScreen() {
  const router = useRouter();
  const { businessInfo } = useAuth();
  const isRestaurant = businessInfo?.business_type === 'restaurant';

  const { data: metrics, isLoading: loading, refetch } = useDashboardMetrics(businessInfo?.id);


  // Expense Modal State
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Food & Chai');
  const [expenseMethod, setExpenseMethod] = useState('cash');
  const [savingExpense, setSavingExpense] = useState(false);



  const handleQuickAction = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (route === 'expense') {
      setExpenseModalVisible(true);
    } else {
      router.push(route as any);
    }
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setSavingExpense(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .insert({
          business_id: businessInfo!.id,
          amount,
          category: expenseCategory,
          payment_method: expenseMethod,
          description: ''
        });

      if (error) {
        if (error.code === '42P01') {
          Alert.alert('Database Error', 'Expenses table not found. Please run the SQL migration first!');
        } else if (error.code === '42501') {
          Alert.alert(
            'Permission Error',
            'Cannot save expense. Ask the app owner to run the latest Supabase migration (expenses_grants_and_rls).',
          );
        } else {
          throw error;
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setExpenseModalVisible(false);
        setExpenseAmount('');
        refetch();
      }
    } catch (err: any) {
      console.error(err);
      const message = err?.message || 'Failed to save expense';
      Alert.alert('Error', message);
    } finally {
      setSavingExpense(false);
    }
  };

  const getTimeAgo = (date: Date | string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.accent} />}
      >
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Overview</Text>
            <Text style={styles.title}>OmniBill Dashboard</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading && !metrics ? (
          <View style={{ gap: 16 }}>
             <Skeleton style={{ height: 120, borderRadius: 16 }} />
             <View style={{ flexDirection: 'row', gap: 12 }}>
                <Skeleton style={{ height: 100, borderRadius: 16, flex: 1 }} />
                <Skeleton style={{ height: 100, borderRadius: 16, flex: 1 }} />
             </View>
             <Skeleton style={{ height: 140, borderRadius: 16, marginTop: 16 }} />
          </View>
        ) : (
          <>
            {/* Summary Cards */}
            <View style={styles.metricsGrid}>
              {/* Sales Card */}
              <View style={[styles.metricCard, styles.metricCardPrimary]}>
                <View style={styles.metricHeader}>
                  <Ionicons name="trending-up" size={20} color={Colors.textPrimary} />
                  <Text style={styles.metricTitlePrimary}>Today's Sales</Text>
                </View>
                <Text style={styles.metricValuePrimary}>₹ { (metrics?.salesToday || 0).toLocaleString('en-IN')}</Text>
                <Text style={styles.metricSubtitlePrimary}>{metrics?.salesCount || 0} transactions</Text>
              </View>

              <View style={styles.metricsRow}>
                {/* Udhaar Card */}
                <View style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <Ionicons name="wallet-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.metricTitle}>Receivables</Text>
                  </View>
                  <Text style={styles.metricValue}>₹ {(metrics?.receivables || 0).toLocaleString('en-IN')}</Text>
                  <Text style={styles.metricSubtitle}>{metrics?.receivablesCount || 0} customers</Text>
                </View>

                {/* Inventory Card */}
                <View style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <Ionicons name="alert-circle-outline" size={18} color={Colors.warn} />
                    <Text style={styles.metricTitle}>Low Stock</Text>
                  </View>
                  <Text style={styles.metricValue}>{metrics?.lowStockCount || 0}</Text>
                  <Text style={styles.metricSubtitle}>items need refill</Text>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.actionsGrid}>
                {isRestaurant ? (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleQuickAction('/(tabs)/tables')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(138, 163, 106, 0.15)' }]}>
                      <Ionicons name="restaurant" size={24} color={Colors.ok} />
                    </View>
                    <Text style={styles.actionText}>Tables</Text>
                  </TouchableOpacity>
                ) : (
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
                )}

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
                  onPress={() => handleQuickAction('expense')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Ionicons name="receipt" size={24} color="#EF4444" />
                  </View>
                  <Text style={styles.actionText}>Add Expense</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => handleQuickAction('/daybook')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                    <Ionicons name="book" size={24} color="#3B82F6" />
                  </View>
                  <Text style={styles.actionText}>Day Book</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Recent Activity */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <TouchableOpacity onPress={() => router.push('/sales-history' as never)}>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.activityList}>
                {(!metrics?.recentActivity || metrics.recentActivity.length === 0) ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: Colors.textSecondary }}>No recent activity</Text>
                  </View>
                ) : (
                  metrics.recentActivity.map((activity, index) => (
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
          </>
        )}

      </ScrollView>

      {/* ADD EXPENSE MODAL */}
      <Modal visible={expenseModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderFixed}>
              <Text style={styles.modalTitle}>Record Daily Expense</Text>
              <TouchableOpacity onPress={() => setExpenseModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput 
                style={[styles.input, { fontSize: 24, fontWeight: '700' }]} 
                value={expenseAmount} 
                onChangeText={setExpenseAmount} 
                keyboardType="numeric" 
                placeholder="0.00" 
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Expense Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['Food & Chai', 'Petrol/Travel', 'Salary', 'Cleaning', 'Other'].map(cat => (
                  <TouchableOpacity 
                    key={cat}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: expenseCategory === cat ? Colors.accent : Colors.border, backgroundColor: expenseCategory === cat ? Colors.accentDim : Colors.surface }}
                    onPress={() => setExpenseCategory(cat)}
                  >
                    <Text style={{ color: expenseCategory === cat ? Colors.accent : Colors.textPrimary }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Paid Via</Text>
              <View style={styles.methodToggle}>
                {['cash', 'upi', 'bank'].map(method => (
                  <TouchableOpacity 
                    key={method} 
                    style={[styles.methodBtn, expenseMethod === method && styles.methodBtnActive]}
                    onPress={() => setExpenseMethod(method)}
                  >
                    <Text style={[styles.methodBtnText, expenseMethod === method && styles.methodBtnTextActive]}>
                      {method.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {expenseMethod === 'cash' && (
                <Text style={{ fontSize: 12, color: Colors.warn, marginTop: 4 }}>* This will deduct from your Day Book Cash Drawer</Text>
              )}
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleAddExpense} disabled={savingExpense}>
              {savingExpense ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitBtnText}>Save Expense</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeaderFixed: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 13, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 16, height: 52, color: Colors.textPrimary, fontSize: 16 },
  methodToggle: { flexDirection: 'row', gap: 12 },
  methodBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  methodBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  methodBtnText: { color: Colors.textPrimary, fontWeight: '500' },
  methodBtnTextActive: { color: Colors.bg, fontWeight: '600' },
  submitBtn: { backgroundColor: Colors.accent, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: Colors.bg, fontSize: 16, fontWeight: '600' },
});
