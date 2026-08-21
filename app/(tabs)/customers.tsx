import { useState, useCallback } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  TextInput, RefreshControl, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';

type Customer = {
  id: string;
  name: string;
  phone: string;
  customer_type: 'cash' | 'credit' | 'retail' | 'wholesale';
  balance: number; // calculated from ledger
};

type LedgerEntry = {
  id: string;
  amount: number;
  transaction_type: 'debit' | 'credit';
  source_type: string;
  created_at: string;
};

export default function CustomersScreen() {
  const { businessInfo } = useAuth();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Customer Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Khata / Ledger Modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [ledgerModalVisible, setLedgerModalVisible] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Payment Modal
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [processingPayment, setProcessingPayment] = useState(false);

  const fetchCustomers = async (isRefreshing = false) => {
    if (!businessInfo?.id) return;
    if (!isRefreshing) setLoading(true);
    
    try {
      const { data: customersData, error: custError } = await supabase
        .from('customers')
        .select('id, name, phone, customer_type')
        .eq('business_id', businessInfo.id)
        .order('name');

      if (custError) throw custError;

      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('customer_id, amount, transaction_type')
        .eq('business_id', businessInfo.id)
        .not('customer_id', 'is', null);

      if (ledgerError) throw ledgerError;

      const balances: Record<string, number> = {};
      ledgerData.forEach(txn => {
        const cid = txn.customer_id as string;
        if (!balances[cid]) balances[cid] = 0;
        if (txn.transaction_type === 'debit') balances[cid] += Number(txn.amount);
        if (txn.transaction_type === 'credit') balances[cid] -= Number(txn.amount);
      });

      const processedCustomers = customersData.map(c => ({
        ...c,
        balance: balances[c.id] || 0
      }));

      setCustomers(processedCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, [businessInfo])
  );

  const handleAddCustomer = async () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }

    setSavingCustomer(true);
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
          business_id: businessInfo!.id,
          name: formName.trim(),
          phone: formPhone.trim() || 'N/A',
          address: 'N/A',
          customer_type: businessInfo?.business_type === 'retail' ? 'retail' : 'wholesale'
        });

      if (error) throw error;
      
      setAddModalVisible(false);
      setFormName('');
      setFormPhone('');
      fetchCustomers();
    } catch (error) {
      Alert.alert('Error', 'Failed to add customer');
      console.error(error);
    } finally {
      setSavingCustomer(false);
    }
  };

  const openCustomerKhata = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setLedgerModalVisible(true);
    setLoadingLedger(true);

    try {
      const { data, error } = await supabase
        .from('ledger_transactions')
        .select('id, amount, transaction_type, source_type, created_at')
        .eq('business_id', businessInfo!.id)
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLedgerEntries(data || []);
    } catch (error) {
      console.error('Error fetching ledger:', error);
    } finally {
      setLoadingLedger(false);
    }
  };

  const openPaymentModal = () => {
    if (!selectedCustomer) return;
    setPaymentAmount(selectedCustomer.balance > 0 ? selectedCustomer.balance.toString() : '');
    setPaymentMethod('cash');
    setPaymentModalVisible(true);
  };

  const handleReceivePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setProcessingPayment(true);
    try {
      // Insert Payment
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          business_id: businessInfo!.id,
          related_type: 'customer',
          related_id: selectedCustomer!.id,
          amount: amount,
          direction: 'received',
          method: paymentMethod
        })
        .select('id')
        .single();

      if (paymentError) throw paymentError;

      // Insert Ledger Credit
      const { error: ledgerError } = await supabase
        .from('ledger_transactions')
        .insert({
          business_id: businessInfo!.id,
          customer_id: selectedCustomer!.id,
          amount: amount,
          transaction_type: 'credit',
          source_type: 'payment',
          source_id: paymentData.id
        });

      if (ledgerError) throw ledgerError;

      setPaymentModalVisible(false);
      
      // Update local state temporarily so UI feels fast
      setSelectedCustomer(prev => prev ? {...prev, balance: prev.balance - amount} : null);
      
      // Re-fetch data
      await openCustomerKhata(selectedCustomer!);
      fetchCustomers();
      
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setProcessingPayment(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  const totalReceivables = customers.reduce((sum, c) => c.balance > 0 ? sum + c.balance : sum, 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Customers (Khata)</Text>
          <Text style={styles.subtitle}>Net Udhaar: ₹ {totalReceivables.toLocaleString('en-IN')}</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setAddModalVisible(true)}>
          <Ionicons name="person-add" size={20} color={Colors.bg} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone"
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchCustomers(true)} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No customers found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.customerCard} onPress={() => openCustomerKhata(item)}>
              <View style={styles.customerAvatar}>
                <Text style={styles.customerInitials}>{item.name.substring(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{item.name}</Text>
                <Text style={styles.customerPhone}>{item.phone}</Text>
              </View>
              <View style={styles.customerBalanceContainer}>
                {item.balance > 0 ? (
                  <>
                    <Text style={styles.balanceAmountRed}>₹ {item.balance.toLocaleString('en-IN')}</Text>
                    <Text style={styles.balanceLabel}>You'll Give</Text>
                  </>
                ) : item.balance < 0 ? (
                  <>
                    <Text style={styles.balanceAmountGreen}>₹ {Math.abs(item.balance).toLocaleString('en-IN')}</Text>
                    <Text style={styles.balanceLabel}>Advance</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.balanceAmountGray}>₹ 0</Text>
                    <Text style={styles.balanceLabel}>Settled</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ADD CUSTOMER MODAL */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Customer</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Customer Name *</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Ramesh Kumar" />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput style={styles.input} value={formPhone} onChangeText={setFormPhone} keyboardType="phone-pad" placeholder="9876543210" />
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleAddCustomer} disabled={savingCustomer}>
              {savingCustomer ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitBtnText}>Save Customer</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* KHATA / LEDGER MODAL */}
      <Modal visible={ledgerModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLedgerModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeaderFixed}>
            <TouchableOpacity onPress={() => setLedgerModalVisible(false)} style={styles.closeBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.modalTitle}>{selectedCustomer?.name}</Text>
              <Text style={styles.subtitle}>{selectedCustomer?.phone}</Text>
            </View>
          </View>

          <View style={styles.ledgerBalanceHeader}>
            <Text style={styles.ledgerBalanceLabel}>Net Balance</Text>
            <Text style={[styles.ledgerBalanceAmount, selectedCustomer?.balance && selectedCustomer.balance > 0 ? { color: Colors.warn } : {}]}>
              ₹ {selectedCustomer?.balance ? selectedCustomer.balance.toLocaleString('en-IN') : 0}
            </Text>
            <Text style={styles.ledgerBalanceSub}>
              {selectedCustomer?.balance && selectedCustomer.balance > 0 ? 'Customer owes you' : 'Settled'}
            </Text>
          </View>

          {loadingLedger ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={Colors.accent} />
          ) : (
            <FlatList
              data={ledgerEntries}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No transaction history</Text>}
              renderItem={({ item }) => (
                <View style={styles.ledgerItem}>
                  <View style={styles.ledgerIconContainer}>
                    <Ionicons 
                      name={item.transaction_type === 'debit' ? "cart" : "cash"} 
                      size={20} 
                      color={item.transaction_type === 'debit' ? Colors.warn : Colors.ok} 
                    />
                  </View>
                  <View style={styles.ledgerDetails}>
                    <Text style={styles.ledgerTitle}>
                      {item.source_type === 'sale' ? 'Sale (Bill)' : 
                       item.source_type === 'payment' ? 'Payment Received' : 'Entry'}
                    </Text>
                    <Text style={styles.ledgerDate}>
                      {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={[styles.ledgerAmount, { color: item.transaction_type === 'debit' ? Colors.warn : Colors.ok }]}>
                    {item.transaction_type === 'debit' ? '+' : '-'} ₹ {Number(item.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
              )}
            />
          )}

          <View style={styles.ledgerFooter}>
            <TouchableOpacity style={styles.receivePaymentBtn} onPress={openPaymentModal}>
              <Ionicons name="cash" size={20} color={Colors.bg} />
              <Text style={styles.receivePaymentBtnText}>Receive Payment</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal visible={paymentModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment In</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount Received (₹)</Text>
              <TextInput 
                style={[styles.input, { fontSize: 24, fontWeight: '700' }]} 
                value={paymentAmount} 
                onChangeText={setPaymentAmount} 
                keyboardType="numeric" 
                placeholder="0.00" 
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.methodToggle}>
                {['cash', 'upi', 'bank'].map(method => (
                  <TouchableOpacity 
                    key={method} 
                    style={[styles.methodBtn, paymentMethod === method && styles.methodBtnActive]}
                    onPress={() => setPaymentMethod(method)}
                  >
                    <Text style={[styles.methodBtnText, paymentMethod === method && styles.methodBtnTextActive]}>
                      {method.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleReceivePayment} disabled={processingPayment}>
              {processingPayment ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitBtnText}>Confirm Payment</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 10 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.warn, fontWeight: '600', marginTop: 4 },
  addButton: { flexDirection: 'row', backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, alignItems: 'center', gap: 6 },
  addButtonText: { color: Colors.bg, fontWeight: '600', fontSize: 14 },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, marginHorizontal: 20, marginBottom: 16, paddingHorizontal: 16, height: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: Colors.textPrimary },
  
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: Colors.textSecondary, marginTop: 12, fontSize: 16 },
  
  customerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  customerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.accentDim, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  customerInitials: { color: Colors.accent, fontSize: 18, fontWeight: '700' },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  customerPhone: { fontSize: 13, color: Colors.textSecondary },
  customerBalanceContainer: { alignItems: 'flex-end' },
  balanceAmountRed: { fontSize: 16, fontWeight: '700', color: Colors.warn },
  balanceAmountGreen: { fontSize: 16, fontWeight: '700', color: Colors.ok },
  balanceAmountGray: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  balanceLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  
  formGroup: { marginBottom: 20 },
  label: { fontSize: 13, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 16, height: 52, color: Colors.textPrimary, fontSize: 16 },
  
  submitBtn: { backgroundColor: Colors.accent, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: Colors.bg, fontSize: 16, fontWeight: '600' },
  
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalHeaderFixed: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  closeBtn: { padding: 4 },
  
  ledgerBalanceHeader: { padding: 24, alignItems: 'center', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  ledgerBalanceLabel: { fontSize: 14, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  ledgerBalanceAmount: { fontSize: 40, fontWeight: '700', color: Colors.textPrimary, marginVertical: 8 },
  ledgerBalanceSub: { fontSize: 14, color: Colors.textSecondary },
  
  ledgerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  ledgerIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceRaised, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  ledgerDetails: { flex: 1 },
  ledgerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary, marginBottom: 4 },
  ledgerDate: { fontSize: 12, color: Colors.textSecondary },
  ledgerAmount: { fontSize: 16, fontWeight: '600' },
  
  ledgerFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border },
  receivePaymentBtn: { backgroundColor: Colors.ok, height: 56, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  receivePaymentBtnText: { color: Colors.bg, fontSize: 16, fontWeight: '600' },
  
  methodToggle: { flexDirection: 'row', gap: 12 },
  methodBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  methodBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  methodBtnText: { color: Colors.textPrimary, fontWeight: '500' },
  methodBtnTextActive: { color: Colors.bg, fontWeight: '600' }
});
