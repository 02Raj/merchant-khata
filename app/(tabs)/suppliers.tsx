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
import * as Haptics from 'expo-haptics';
import { Skeleton } from '@/components/Skeleton';
import { toE164India } from '@/lib/phone';

type Supplier = {
  id: string;
  name: string;
  phone: string;
  balance: number; // calculated from ledger
};

type LedgerEntry = {
  id: string;
  amount: number;
  transaction_type: 'debit' | 'credit';
  source_type: string;
  created_at: string;
};

export default function SuppliersScreen() {
  const { businessInfo, session } = useAuth();
  
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Supplier Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Khata / Ledger Modal
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [ledgerModalVisible, setLedgerModalVisible] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Payment Modal (Payment Out to Supplier)
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Direct Purchase Modal
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseProductId, setPurchaseProductId] = useState<string | null>(null);
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseProducts, setPurchaseProducts] = useState<{ id: string; name: string; purchase_price: number }[]>([]);
  const [processingPurchase, setProcessingPurchase] = useState(false);

  const fetchSuppliers = async (isRefreshing = false) => {
    if (!businessInfo?.id) return;
    if (!isRefreshing) setLoading(true);
    
    try {
      const { data: suppliersData, error: suppError } = await supabase
        .from('suppliers')
        .select('id, name, phone')
        .eq('business_id', businessInfo.id)
        .order('name');

      if (suppError) throw suppError;

      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('supplier_id, amount, transaction_type')
        .eq('business_id', businessInfo.id)
        .not('supplier_id', 'is', null);

      if (ledgerError) throw ledgerError;

      const balances: Record<string, number> = {};
      // For suppliers: Credit = we owe them (Payable), Debit = we paid them or advance
      ledgerData.forEach(txn => {
        const sid = txn.supplier_id as string;
        if (!balances[sid]) balances[sid] = 0;
        if (txn.transaction_type === 'credit') balances[sid] += Number(txn.amount); // Payable increases
        if (txn.transaction_type === 'debit') balances[sid] -= Number(txn.amount);  // Payable decreases
      });

      const processedSuppliers = suppliersData.map(s => ({
        ...s,
        balance: balances[s.id] || 0
      }));

      setSuppliers(processedSuppliers);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSuppliers();
    }, [businessInfo])
  );

  const handleAddSupplier = async () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Supplier name is required');
      return;
    }

    let phoneToSave = 'N/A';
    if (formPhone.trim()) {
      const phoneResult = toE164India(formPhone.trim());
      if (!phoneResult.ok) {
        Alert.alert('Invalid phone', phoneResult.error);
        return;
      }
      phoneToSave = phoneResult.phone;
    }

    setSavingSupplier(true);
    try {
      const { error } = await supabase
        .from('suppliers')
        .insert({
          business_id: businessInfo!.id,
          name: formName.trim(),
          phone: phoneToSave,
          address: formAddress.trim() || 'N/A',
        });

      if (error) throw error;
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddModalVisible(false);
      setFormName('');
      setFormPhone('');
      setFormAddress('');
      fetchSuppliers();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to add supplier');
      console.error(error);
    } finally {
      setSavingSupplier(false);
    }
  };

  const openSupplierKhata = async (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setLedgerModalVisible(true);
    setLoadingLedger(true);

    try {
      const { data, error } = await supabase
        .from('ledger_transactions')
        .select('id, amount, transaction_type, source_type, created_at')
        .eq('business_id', businessInfo!.id)
        .eq('supplier_id', supplier.id)
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
    if (!selectedSupplier) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPaymentAmount(selectedSupplier.balance > 0 ? selectedSupplier.balance.toString() : '');
    setPaymentMethod('cash');
    setPaymentModalVisible(true);
  };

  const openPurchaseModal = async () => {
    if (!selectedSupplier) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPurchaseAmount('');
    setPurchaseProductId(null);
    setPurchaseQty('');

    const { data } = await supabase
      .from('products')
      .select('id, name, purchase_price')
      .eq('business_id', businessInfo!.id)
      .eq('is_active', true)
      .order('name');
    setPurchaseProducts((data || []).map((p) => ({
      id: p.id,
      name: p.name,
      purchase_price: Number(p.purchase_price),
    })));

    setPurchaseModalVisible(true);
  };

  const handleAddPurchase = async () => {
    const amount = parseFloat(purchaseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const items = [];
    if (purchaseProductId && purchaseQty.trim()) {
      const qty = parseFloat(purchaseQty);
      if (isNaN(qty) || qty <= 0) {
        Alert.alert('Error', 'Enter a valid stock quantity');
        return;
      }
      const product = purchaseProducts.find((p) => p.id === purchaseProductId);
      if (!product) {
        Alert.alert('Error', 'Select a valid product');
        return;
      }
      items.push({
        product_id: product.id,
        quantity: qty,
        unit_cost: product.purchase_price,
        subtotal: qty * product.purchase_price,
      });
    }

    setProcessingPurchase(true);
    try {
      const { error } = await supabase.rpc('record_supplier_purchase', {
        p_business_id: businessInfo!.id,
        p_supplier_id: selectedSupplier!.id,
        p_created_by: session?.uid || 'owner',
        p_total_amount: amount,
        p_items: items,
      });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPurchaseModalVisible(false);
      
      setSelectedSupplier(prev => prev ? {...prev, balance: prev.balance + amount} : null);
      await openSupplierKhata(selectedSupplier!);
      fetchSuppliers();
    } catch (error: any) {
      console.error('Purchase error:', error);
      Alert.alert('Purchase failed', error?.message || 'Could not record purchase.');
    } finally {
      setProcessingPurchase(false);
    }
  };

  const handlePaySupplier = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setProcessingPayment(true);
    try {
      // Insert Payment Out
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          business_id: businessInfo!.id,
          related_type: 'supplier',
          related_id: selectedSupplier!.id,
          amount: amount,
          direction: 'paid',
          method: paymentMethod
        })
        .select('id')
        .single();

      if (paymentError) throw paymentError;

      // Insert Ledger Debit (Reduces our payable)
      const { error: ledgerError } = await supabase
        .from('ledger_transactions')
        .insert({
          business_id: businessInfo!.id,
          supplier_id: selectedSupplier!.id,
          amount: amount,
          transaction_type: 'debit',
          source_type: 'payment',
          source_id: paymentData.id
        });

      if (ledgerError) throw ledgerError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPaymentModalVisible(false);
      
      setSelectedSupplier(prev => prev ? {...prev, balance: prev.balance - amount} : null);
      await openSupplierKhata(selectedSupplier!);
      fetchSuppliers();
      
    } catch (error: any) {
      console.error('Payment error:', error);
      Alert.alert('Payment failed', error?.message || 'Could not record payment.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.phone.includes(searchQuery)
  );

  const totalPayables = suppliers.reduce((sum, s) => s.balance > 0 ? sum + s.balance : sum, 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Suppliers</Text>
          <Text style={styles.subtitle}>Total Payable: ₹ {totalPayables.toLocaleString('en-IN')}</Text>
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
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} style={styles.customerSkeleton} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredSuppliers}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchSuppliers(true)} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bus-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No suppliers found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.customerCard} onPress={() => openSupplierKhata(item)}>
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
                    <Text style={styles.balanceLabel}>Payable</Text>
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

      {/* ADD SUPPLIER MODAL */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Supplier</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Supplier Name *</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Distributor Name" />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput style={styles.input} value={formPhone} onChangeText={setFormPhone} keyboardType="phone-pad" placeholder="9876543210" />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Address</Text>
              <TextInput style={styles.input} value={formAddress} onChangeText={setFormAddress} placeholder="Godown, city" />
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleAddSupplier} disabled={savingSupplier}>
              {savingSupplier ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitBtnText}>Save Supplier</Text>}
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
              <Text style={styles.modalTitle}>{selectedSupplier?.name}</Text>
              <Text style={styles.subtitle}>{selectedSupplier?.phone}</Text>
            </View>
          </View>

          <View style={styles.ledgerBalanceHeader}>
            <Text style={styles.ledgerBalanceLabel}>Net Payable</Text>
            <Text style={[styles.ledgerBalanceAmount, selectedSupplier?.balance && selectedSupplier.balance > 0 ? { color: Colors.warn } : {}]}>
              ₹ {selectedSupplier?.balance ? selectedSupplier.balance.toLocaleString('en-IN') : 0}
            </Text>
            <Text style={styles.ledgerBalanceSub}>
              {selectedSupplier?.balance && selectedSupplier.balance > 0 ? 'You owe this supplier' : 'Settled'}
            </Text>
          </View>

          {loadingLedger ? (
            <View style={{ padding: 20 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} style={styles.ledgerSkeleton} />)}
            </View>
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
                      name={item.transaction_type === 'credit' ? "cart" : "cash"} 
                      size={20} 
                      color={item.transaction_type === 'credit' ? Colors.warn : Colors.ok} 
                    />
                  </View>
                  <View style={styles.ledgerDetails}>
                    <Text style={styles.ledgerTitle}>
                      {item.source_type === 'purchase' ? 'Purchase Bill' : 
                       item.source_type === 'payment' ? 'Payment Out' : 'Entry'}
                    </Text>
                    <Text style={styles.ledgerDate}>
                      {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={[styles.ledgerAmount, { color: item.transaction_type === 'credit' ? Colors.warn : Colors.ok }]}>
                    {item.transaction_type === 'credit' ? '+' : '-'} ₹ {Number(item.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
              )}
            />
          )}

          <View style={[styles.ledgerFooter, { flexDirection: 'row', gap: 12 }]}>
            <TouchableOpacity style={[styles.receivePaymentBtn, { flex: 1, backgroundColor: Colors.warn }]} onPress={openPurchaseModal}>
              <Ionicons name="cart" size={20} color={Colors.bg} />
              <Text style={styles.receivePaymentBtnText}>Add Purchase</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.receivePaymentBtn, { flex: 1 }]} onPress={openPaymentModal}>
              <Ionicons name="cash" size={20} color={Colors.bg} />
              <Text style={styles.receivePaymentBtnText}>Pay Supplier</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ADD PURCHASE MODAL */}
      <Modal visible={purchaseModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Purchase Bill</Text>
              <TouchableOpacity onPress={() => setPurchaseModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Bill Total Amount (₹)</Text>
              <TextInput 
                style={[styles.input, { fontSize: 24, fontWeight: '700', borderColor: Colors.warn, borderWidth: 2 }]} 
                value={purchaseAmount} 
                onChangeText={setPurchaseAmount} 
                keyboardType="numeric" 
                placeholder="0.00" 
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Link stock (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.methodBtn, !purchaseProductId && styles.methodBtnActive]}
                  onPress={() => setPurchaseProductId(null)}
                >
                  <Text style={[styles.methodBtnText, !purchaseProductId && styles.methodBtnTextActive]}>None</Text>
                </TouchableOpacity>
                {purchaseProducts.map((product) => (
                  <TouchableOpacity
                    key={product.id}
                    style={[styles.methodBtn, purchaseProductId === product.id && styles.methodBtnActive, { marginLeft: 8 }]}
                    onPress={() => setPurchaseProductId(product.id)}
                  >
                    <Text style={[styles.methodBtnText, purchaseProductId === product.id && styles.methodBtnTextActive]}>
                      {product.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {purchaseProductId ? (
                <TextInput
                  style={styles.input}
                  value={purchaseQty}
                  onChangeText={setPurchaseQty}
                  keyboardType="numeric"
                  placeholder="Quantity received"
                />
              ) : null}
            </View>

            <Text style={{ color: Colors.textSecondary, marginBottom: 20 }}>
              Bill amount is added to supplier khata. If you link a product, stock increases automatically.
            </Text>
            
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: Colors.warn }]} onPress={handleAddPurchase} disabled={processingPurchase}>
              {processingPurchase ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitBtnText}>Confirm Purchase</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PAYMENT OUT MODAL */}
      <Modal visible={paymentModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment Out</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount Paid (₹)</Text>
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
            
            <TouchableOpacity style={styles.submitBtn} onPress={handlePaySupplier} disabled={processingPayment}>
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
  methodBtnTextActive: { color: Colors.bg, fontWeight: '600' },
  
  skeletonContainer: { padding: 20, gap: 12 },
  customerSkeleton: { height: 82, borderRadius: 16 },
  ledgerSkeleton: { height: 72, borderRadius: 0, marginBottom: 16 }
});
