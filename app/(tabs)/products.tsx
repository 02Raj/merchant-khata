import { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, 
  Platform, ScrollView, RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { getFirebaseAuth } from '@/lib/firebase';

type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  purchase_price: number;
  sale_price: number;
  wholesale_price: number | null;
  moq: number | null;
  is_active: boolean;
  stockCount: number;
};

type BusinessInfo = {
  id: string;
  business_type: 'retail' | 'wholesale' | 'both';
};

const COMMON_UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'pack'];

export default function ProductsScreen() {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formPurchasePrice, setFormPurchasePrice] = useState('');
  const [formSalePrice, setFormSalePrice] = useState('');
  const [formWholesalePrice, setFormWholesalePrice] = useState('');
  const [formMoq, setFormMoq] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const fetchBusinessInfo = async () => {
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) return null;

      // Note: Because of RLS, fetching businesses will only return the ones we have access to
      const { data, error } = await supabase
        .from('businesses')
        .select('id, business_type')
        .limit(1)
        .single();
        
      if (error) throw error;
      setBusinessInfo(data as BusinessInfo);
      return data;
    } catch (err: any) {
      console.error('Error fetching business info:', err);
      return null;
    }
  };

  const fetchProducts = async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('products')
        .select(`
          *,
          inventory_transactions (
            quantity_change
          )
        `)
        .order('name');

      if (fetchError) throw fetchError;

      const processedProducts: Product[] = (data || []).map((p: any) => {
        const stock = p.inventory_transactions?.reduce((sum: number, txn: any) => sum + Number(txn.quantity_change), 0) || 0;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          unit: p.unit,
          purchase_price: Number(p.purchase_price),
          sale_price: Number(p.sale_price),
          wholesale_price: p.wholesale_price ? Number(p.wholesale_price) : null,
          moq: p.moq ? Number(p.moq) : null,
          is_active: p.is_active,
          stockCount: stock,
        };
      });

      setProducts(processedProducts);
    } catch (err: any) {
      setError('Could not load products. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const initData = async () => {
    await fetchBusinessInfo();
    await fetchProducts();
  };

  // Fetch on mount or tab focus
  useFocusEffect(
    useCallback(() => {
      initData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts(true);
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormName('');
    setFormCategory('');
    setFormUnit('pcs');
    setFormPurchasePrice('');
    setFormSalePrice('');
    setFormWholesalePrice('');
    setFormMoq('');
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (product: Product) => {
    setEditingId(product.id);
    setFormName(product.name);
    setFormCategory(product.category);
    setFormUnit(product.unit);
    setFormPurchasePrice(product.purchase_price.toString());
    setFormSalePrice(product.sale_price.toString());
    setFormWholesalePrice(product.wholesale_price?.toString() || '');
    setFormMoq(product.moq?.toString() || '');
    setFormError(null);
    setModalVisible(true);
  };

  const closeForm = () => {
    setModalVisible(false);
    setSaving(false);
  };

  const onSubmitForm = async () => {
    setFormError(null);
    if (!businessInfo?.id) {
      setFormError('Business not found. Try restarting the app.');
      return;
    }
    if (!formName.trim() || !formCategory.trim() || !formUnit.trim() || !formPurchasePrice.trim() || !formSalePrice.trim()) {
      setFormError('Please fill all required fields.');
      return;
    }

    const purchase = parseFloat(formPurchasePrice);
    const sale = parseFloat(formSalePrice);
    if (isNaN(purchase) || purchase < 0 || isNaN(sale) || sale < 0) {
      setFormError('Prices must be valid positive numbers.');
      return;
    }

    let wholesale: number | null = null;
    let moqVal: number | null = null;

    if (businessInfo.business_type === 'wholesale' || businessInfo.business_type === 'both') {
      if (formWholesalePrice.trim()) {
        wholesale = parseFloat(formWholesalePrice);
        if (isNaN(wholesale) || wholesale < 0) {
          setFormError('Wholesale price must be a positive number.');
          return;
        }
      }
      if (formMoq.trim()) {
        moqVal = parseFloat(formMoq);
        if (isNaN(moqVal) || moqVal <= 0) {
          setFormError('MOQ must be a positive number greater than 0.');
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        business_id: businessInfo.id,
        name: formName.trim(),
        category: formCategory.trim(),
        unit: formUnit.trim(),
        purchase_price: purchase,
        sale_price: sale,
        wholesale_price: wholesale,
        moq: moqVal,
        is_active: true,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('products')
          .insert(payload);
        if (insertError) throw insertError;
      }

      closeForm();
      fetchProducts(false); // Silent reload
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderProductItem = ({ item }: { item: Product }) => {
    let stockStatus = 'In Stock';
    let stockColor = Colors.ok;
    
    if (item.stockCount <= 0) {
      stockStatus = 'Out of Stock';
      stockColor = Colors.textSecondary;
    } else if (item.stockCount <= 5) {
      stockStatus = 'Low Stock';
      stockColor = Colors.warn;
    }

    return (
      <TouchableOpacity 
        style={styles.productCard} 
        activeOpacity={0.7}
        onPress={() => openEditModal(item)}
      >
        <View style={styles.productHeader}>
          <Text style={styles.productName}>{item.name}</Text>
          <View style={[styles.stockBadge, { backgroundColor: stockColor + '20' }]}>
            <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
            <Text style={[styles.stockText, { color: stockColor }]}>
              {item.stockCount} {item.unit}
            </Text>
          </View>
        </View>
        
        <Text style={styles.productCategory}>{item.category}</Text>
        
        <View style={styles.productPricing}>
          <View>
            <Text style={styles.priceLabel}>Sale Price</Text>
            <Text style={styles.priceValue}>₹{item.sale_price.toFixed(2)}</Text>
          </View>
          {item.wholesale_price ? (
            <View>
              <Text style={styles.priceLabel}>Wholesale (Min: {item.moq || 1})</Text>
              <Text style={styles.priceValue}>₹{item.wholesale_price.toFixed(2)}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Inventory</Text>
          <Text style={styles.title}>Products</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal} disabled={!businessInfo}>
          <Ionicons name="add" size={24} color={Colors.bg} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
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

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.warn} />
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchProducts()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cube-outline" size={64} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>No Products Yet</Text>
          <Text style={styles.emptyText}>Add your first product to start billing and managing inventory.</Text>
          <TouchableOpacity style={styles.primaryAction} onPress={openAddModal}>
            <Text style={styles.primaryActionText}>Add Your First Product</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>No products match your search.</Text>
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeForm}>
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeForm} style={styles.modalClose}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Product' : 'Add Product'}</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Product Name *</Text>
                <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="e.g. Tata Salt 1kg" placeholderTextColor={Colors.textSecondary} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Category *</Text>
                <TextInput style={styles.input} value={formCategory} onChangeText={setFormCategory} placeholder="e.g. Groceries" placeholderTextColor={Colors.textSecondary} />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Unit *</Text>
                  <View style={styles.unitSelector}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {COMMON_UNITS.map(u => (
                        <TouchableOpacity 
                          key={u} 
                          style={[styles.unitChip, formUnit === u && styles.unitChipActive]}
                          onPress={() => setFormUnit(u)}
                        >
                          <Text style={[styles.unitChipText, formUnit === u && styles.unitChipTextActive]}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Purchase Price (₹) *</Text>
                  <TextInput style={styles.input} value={formPurchasePrice} onChangeText={setFormPurchasePrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Sale Price (₹) *</Text>
                  <TextInput style={styles.input} value={formSalePrice} onChangeText={setFormSalePrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} />
                </View>
              </View>

              {(businessInfo?.business_type === 'wholesale' || businessInfo?.business_type === 'both') && (
                <View style={styles.wholesaleContainer}>
                  <Text style={styles.sectionDivider}>Wholesale Options</Text>
                  <View style={styles.row}>
                    <View style={[styles.formGroup, { flex: 1 }]}>
                      <Text style={styles.label}>Wholesale Price</Text>
                      <TextInput style={styles.input} value={formWholesalePrice} onChangeText={setFormWholesalePrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} />
                    </View>
                    <View style={[styles.formGroup, { flex: 1 }]}>
                      <Text style={styles.label}>Min Qty (MOQ)</Text>
                      <TextInput style={styles.input} value={formMoq} onChangeText={setFormMoq} keyboardType="numeric" placeholder="10" placeholderTextColor={Colors.textSecondary} />
                    </View>
                  </View>
                </View>
              )}

              {formError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              )}

              <TouchableOpacity style={[styles.submitButton, saving && styles.submitButtonDisabled]} onPress={onSubmitForm} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitButtonText}>Save Product</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  kicker: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: Colors.accentInk, marginBottom: 4, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  addButton: { flexDirection: 'row', backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, alignItems: 'center', gap: 6 },
  addButtonText: { color: Colors.bg, fontWeight: '700', fontSize: 14 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, marginHorizontal: 20, marginBottom: 16, borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 16 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  productCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  productName: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, flex: 1, marginRight: 12 },
  stockBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: 11, fontWeight: '600' },
  productCategory: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },
  productPricing: { flexDirection: 'row', gap: 24 },
  priceLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  priceValue: { fontSize: 16, color: Colors.textPrimary, fontWeight: '600' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  retryButton: { marginTop: 16, padding: 12 },
  retryText: { color: Colors.accent, fontSize: 16, fontWeight: '600' },
  primaryAction: { marginTop: 24, backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  primaryActionText: { color: Colors.bg, fontSize: 16, fontWeight: '700' },
  
  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalKeyboard: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  modalClose: { padding: 8, marginLeft: -8 },
  modalScroll: { padding: 20, gap: 20 },
  formGroup: { gap: 8 },
  label: { fontSize: 13, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 16, height: 52, color: Colors.textPrimary, fontSize: 16 },
  row: { flexDirection: 'row', gap: 16 },
  unitSelector: { flexDirection: 'row', alignItems: 'center', height: 52 },
  unitChip: { paddingHorizontal: 16, height: 40, justifyContent: 'center', backgroundColor: Colors.surfaceRaised, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  unitChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  unitChipText: { color: Colors.textSecondary, fontWeight: '500' },
  unitChipTextActive: { color: Colors.bg, fontWeight: '700' },
  wholesaleContainer: { marginTop: 8, paddingTop: 24, borderTopWidth: 1, borderTopColor: Colors.border, gap: 20 },
  sectionDivider: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  errorContainer: { backgroundColor: 'rgba(201, 162, 39, 0.15)', padding: 12, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: Colors.warn },
  errorText: { color: Colors.textPrimary, fontSize: 13 },
  submitButton: { backgroundColor: Colors.accent, height: 56, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 40 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: Colors.bg, fontSize: 16, fontWeight: '700' }
});
