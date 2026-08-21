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
import { useAuth } from '@/context/AuthContext';

type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_category: 'quantity' | 'measurement';
  purchase_price: number;
  sale_price: number;
  wholesale_price: number | null;
  moq: number | null;
  is_active: boolean;
  stockCount: number;
  low_stock_threshold: number;
  hsn_code: string | null;
  gst_rate: number;
  tax_inclusive: boolean;
  barcode: string | null;
};

const PREDEFINED_CATEGORIES = ['Groceries', 'Electronics', 'Clothing', 'Hardware', 'Dairy', 'Spices', 'Snacks', 'Beverages'];
const QUANTITY_UNITS = ['pcs', 'box', 'pack', 'dozen', 'carton'];
const MEASUREMENT_UNITS = ['kg', 'g', 'ltr', 'ml', 'meter'];
const GST_RATES = [0, 5, 12, 18, 28];

export default function ProductsScreen() {
  const { businessInfo } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formIsCustomCategory, setFormIsCustomCategory] = useState(false);
  const [formUnitCategory, setFormUnitCategory] = useState<'quantity' | 'measurement'>('quantity');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formLowStockThreshold, setFormLowStockThreshold] = useState('5');
  const [formPurchasePrice, setFormPurchasePrice] = useState('');
  const [formSalePrice, setFormSalePrice] = useState('');
  const [formWholesalePrice, setFormWholesalePrice] = useState('');
  const [formMoq, setFormMoq] = useState('');
  const [formHsnCode, setFormHsnCode] = useState('');
  const [formGstRate, setFormGstRate] = useState(0);
  const [formTaxInclusive, setFormTaxInclusive] = useState(true);
  const [formBarcode, setFormBarcode] = useState('');
  const [formOpeningStock, setFormOpeningStock] = useState('');
  const [originalStock, setOriginalStock] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchProducts = async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    setError(null);
    try {
      if (!businessInfo) throw new Error('Not authenticated properly');
      const { data, error: fetchError } = await supabase
        .from('products')
        .select(`
          *,
          inventory_transactions (
            quantity_change
          )
        `)
        .eq('business_id', businessInfo.id)
        .order('name');

      if (fetchError) throw fetchError;

      const processedProducts: Product[] = (data || []).map((p: any) => {
        const stock = p.inventory_transactions?.reduce((sum: number, txn: any) => sum + Number(txn.quantity_change), 0) || 0;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          unit: p.unit,
          unit_category: p.unit_category || 'quantity',
          purchase_price: Number(p.purchase_price),
          sale_price: Number(p.sale_price),
          wholesale_price: p.wholesale_price ? Number(p.wholesale_price) : null,
          moq: p.moq ? Number(p.moq) : null,
          is_active: p.is_active,
          stockCount: stock,
          low_stock_threshold: p.low_stock_threshold ? Number(p.low_stock_threshold) : 5,
          hsn_code: p.hsn_code || null,
          gst_rate: p.gst_rate ? Number(p.gst_rate) : 0,
          tax_inclusive: p.tax_inclusive !== false,
          barcode: p.barcode || null,
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
    await fetchProducts();
  };

  // Fetch on mount or tab focus
  useFocusEffect(
    useCallback(() => {
      initData();
    }, [businessInfo])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts(true);
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormName('');
    setFormCategory('');
    setFormIsCustomCategory(false);
    setFormUnitCategory('quantity');
    setFormUnit('pcs');
    setFormLowStockThreshold('5');
    setFormPurchasePrice('');
    setFormSalePrice('');
    setFormWholesalePrice('');
    setFormMoq('');
    setFormHsnCode('');
    setFormGstRate(0);
    setFormTaxInclusive(true);
    setFormBarcode('');
    setFormOpeningStock('');
    setFormError(null);
    setShowAdvancedOptions(false);
    setModalVisible(true);
  };

  const openEditModal = (product: Product) => {
    setEditingId(product.id);
    setFormName(product.name);
    setFormCategory(product.category);
    setFormIsCustomCategory(!PREDEFINED_CATEGORIES.includes(product.category));
    setFormUnitCategory(product.unit_category);
    setFormUnit(product.unit);
    setFormLowStockThreshold(product.low_stock_threshold.toString());
    setFormPurchasePrice(product.purchase_price.toString());
    setFormSalePrice(product.sale_price.toString());
    setFormWholesalePrice(product.wholesale_price?.toString() || '');
    setFormMoq(product.moq?.toString() || '');
    setFormHsnCode(product.hsn_code || '');
    setFormGstRate(product.gst_rate);
    setFormTaxInclusive(product.tax_inclusive);
    setFormBarcode(product.barcode || '');
    setFormOpeningStock(product.stockCount.toString());
    setOriginalStock(product.stockCount);
    setFormError(null);
    
    const hasAdvancedData = Boolean(
      product.barcode || 
      product.gst_rate > 0 || 
      product.hsn_code || 
      product.wholesale_price || 
      product.low_stock_threshold !== 5
    );
    setShowAdvancedOptions(hasAdvancedData);
    
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
    const finalCategory = formCategory.trim();
    if (!formName.trim() || !finalCategory || !formUnit.trim() || !formPurchasePrice.trim() || !formSalePrice.trim()) {
      setFormError('Please fill all required fields.');
      return;
    }

    const purchase = parseFloat(formPurchasePrice);
    const sale = parseFloat(formSalePrice);
    if (isNaN(purchase) || purchase < 0 || isNaN(sale) || sale < 0) {
      setFormError('Prices must be valid positive numbers.');
      return;
    }

    const lowStock = parseFloat(formLowStockThreshold);
    if (isNaN(lowStock) || lowStock < 0) {
      setFormError('Low stock threshold must be a valid positive number.');
      return;
    }

    let openingStockVal = 0;
    if (formOpeningStock.trim()) {
      openingStockVal = parseFloat(formOpeningStock);
      if (isNaN(openingStockVal) || openingStockVal < 0) {
        setFormError('Stock must be a valid positive number.');
        return;
      }
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
        hsn_code: formHsnCode.trim() || null,
        gst_rate: formGstRate,
        tax_inclusive: formTaxInclusive,
        barcode: formBarcode.trim() || null,
        is_active: true,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
        
        // Handle manual stock adjustment during edit
        const qtyChange = openingStockVal - originalStock;
        if (qtyChange !== 0) {
          const { error: invError } = await supabase
            .from('inventory_transactions')
            .insert({
              business_id: businessInfo.id,
              product_id: editingId,
              quantity_change: qtyChange,
              reason: 'Manual adjustment',
              source_type: 'adjustment',
              source_id: editingId // using product id as source for manual adjustment
            });
          if (invError) throw invError;
        }
      } else {
        const { data: newProduct, error: insertError } = await supabase
          .from('products')
          .insert(payload)
          .select('id')
          .single();
        if (insertError) throw insertError;

        if (newProduct && openingStockVal > 0) {
          const { error: stockError } = await supabase.from('inventory_transactions').insert({
            business_id: businessInfo.id,
            product_id: newProduct.id,
            quantity_change: openingStockVal,
            reason: 'Opening Stock',
            source_type: 'adjustment',
            source_id: newProduct.id,
          });
          if (stockError) throw stockError;
        }
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
    } else if (item.stockCount <= item.low_stock_threshold) {
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
            <Text style={styles.gstText}>{item.gst_rate}% GST {item.tax_inclusive ? '(Inc)' : '(Exc)'}</Text>
          </View>
          {businessInfo?.business_type !== 'retail' && item.wholesale_price ? (
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
              {/* --- THE ESSENTIALS --- */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Product Name *</Text>
                <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="e.g. Tata Salt 1kg" placeholderTextColor={Colors.textSecondary} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Category *</Text>
                {formIsCustomCategory ? (
                  <View style={styles.row}>
                    <TextInput style={[styles.input, { flex: 1 }]} value={formCategory} onChangeText={setFormCategory} placeholder="Enter Custom Category" placeholderTextColor={Colors.textSecondary} />
                    <TouchableOpacity style={styles.cancelCustomButton} onPress={() => { setFormIsCustomCategory(false); setFormCategory(''); }}>
                      <Ionicons name="close" size={24} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.unitSelector}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {PREDEFINED_CATEGORIES.map(c => (
                        <TouchableOpacity key={c} style={[styles.unitChip, formCategory === c && styles.unitChipActive]} onPress={() => setFormCategory(c)}>
                          <Text style={[styles.unitChipText, formCategory === c && styles.unitChipTextActive]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity style={styles.unitChip} onPress={() => { setFormIsCustomCategory(true); setFormCategory(''); }}>
                        <Text style={styles.unitChipText}>+ Custom</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Unit Type & Unit *</Text>
                  <View style={styles.unitTypeToggle}>
                    <TouchableOpacity style={[styles.toggleBtn, formUnitCategory === 'quantity' && styles.toggleBtnActive]} onPress={() => { setFormUnitCategory('quantity'); setFormUnit('pcs'); }}>
                      <Text style={[styles.toggleBtnText, formUnitCategory === 'quantity' && styles.toggleBtnTextActive]}>Quantity</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, formUnitCategory === 'measurement' && styles.toggleBtnActive]} onPress={() => { setFormUnitCategory('measurement'); setFormUnit('kg'); }}>
                      <Text style={[styles.toggleBtnText, formUnitCategory === 'measurement' && styles.toggleBtnTextActive]}>Measurement</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.unitSelector, { marginTop: 12 }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {(formUnitCategory === 'quantity' ? QUANTITY_UNITS : MEASUREMENT_UNITS).map(u => (
                        <TouchableOpacity key={u} style={[styles.unitChip, formUnit === u && styles.unitChipActive]} onPress={() => setFormUnit(u)}>
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

              <View style={styles.formGroup}>
                <Text style={styles.label}>{editingId ? 'Current Stock' : 'Opening Stock'}</Text>
                <TextInput style={styles.input} value={formOpeningStock} onChangeText={setFormOpeningStock} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textSecondary} />
              </View>

              {/* --- TOGGLE BUTTON --- */}
              <TouchableOpacity 
                style={styles.advancedToggleBtn} 
                onPress={() => setShowAdvancedOptions(!showAdvancedOptions)}
                activeOpacity={0.7}
              >
                <Ionicons name={showAdvancedOptions ? "chevron-up" : "chevron-down"} size={20} color={Colors.accent} />
                <Text style={styles.advancedToggleText}>
                  {showAdvancedOptions ? "Hide Advanced Details" : "Add Advanced Details (Barcode, Tax, Wholesale)"}
                </Text>
              </TouchableOpacity>

              {/* --- ADVANCED DETAILS --- */}
              {showAdvancedOptions && (
                <View style={styles.advancedSection}>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Barcode / SKU (Optional)</Text>
                    <TextInput style={styles.input} value={formBarcode} onChangeText={setFormBarcode} placeholder="Scan or enter barcode" placeholderTextColor={Colors.textSecondary} />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Low Stock Alert *</Text>
                    <TextInput style={styles.input} value={formLowStockThreshold} onChangeText={setFormLowStockThreshold} keyboardType="numeric" placeholder="e.g. 5" placeholderTextColor={Colors.textSecondary} />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.sectionDivider}>GST & Tax Details</Text>
                    <View style={styles.row}>
                      <View style={[styles.formGroup, { flex: 1 }]}>
                        <Text style={styles.label}>HSN / SAC Code</Text>
                        <TextInput style={styles.input} value={formHsnCode} onChangeText={setFormHsnCode} placeholder="e.g. 1006" placeholderTextColor={Colors.textSecondary} />
                      </View>
                      <View style={[styles.formGroup, { flex: 1 }]}>
                        <Text style={styles.label}>GST Rate %</Text>
                        <View style={styles.unitSelector}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {GST_RATES.map(rate => (
                              <TouchableOpacity key={rate} style={[styles.unitChip, formGstRate === rate && styles.unitChipActive]} onPress={() => setFormGstRate(rate)}>
                                <Text style={[styles.unitChipText, formGstRate === rate && styles.unitChipTextActive]}>{rate}%</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.unitTypeToggle}>
                      <TouchableOpacity style={[styles.toggleBtn, formTaxInclusive && styles.toggleBtnActive]} onPress={() => setFormTaxInclusive(true)}>
                        <Text style={[styles.toggleBtnText, formTaxInclusive && styles.toggleBtnTextActive]}>Inclusive of Tax</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.toggleBtn, !formTaxInclusive && styles.toggleBtnActive]} onPress={() => setFormTaxInclusive(false)}>
                        <Text style={[styles.toggleBtnText, !formTaxInclusive && styles.toggleBtnTextActive]}>Exclusive of Tax</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {formGstRate > 0 && formSalePrice && !isNaN(parseFloat(formSalePrice)) && (
                      <View style={styles.taxPreview}>
                        {formTaxInclusive ? (
                          <Text style={styles.taxPreviewText}>Base: ₹{(parseFloat(formSalePrice) * 100 / (100 + formGstRate)).toFixed(2)} | Tax: ₹{(parseFloat(formSalePrice) - (parseFloat(formSalePrice) * 100 / (100 + formGstRate))).toFixed(2)}</Text>
                        ) : (
                          <Text style={styles.taxPreviewText}>Tax: ₹{(parseFloat(formSalePrice) * formGstRate / 100).toFixed(2)} | Total: ₹{(parseFloat(formSalePrice) * (1 + formGstRate / 100)).toFixed(2)}</Text>
                        )}
                      </View>
                    )}
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
  unitChipTextActive: { color: Colors.bg, fontWeight: '600' },
  cancelCustomButton: { padding: 12, backgroundColor: Colors.surface, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  
  advancedToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, marginTop: 8, marginBottom: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  advancedToggleText: { color: Colors.accent, fontWeight: '600', marginLeft: 8 },
  advancedSection: { padding: 16, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },

  unitTypeToggle: { flexDirection: 'row', backgroundColor: Colors.surfaceRaised, borderRadius: 8, padding: 4 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  toggleBtnActive: { backgroundColor: Colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleBtnText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  toggleBtnTextActive: { color: Colors.textPrimary, fontWeight: '600' },
  gstText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  taxPreview: { backgroundColor: Colors.surfaceRaised, padding: 12, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: Colors.border },
  taxPreviewText: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center', fontWeight: '500' },
  wholesaleContainer: { marginTop: 8, paddingTop: 24, borderTopWidth: 1, borderTopColor: Colors.border, gap: 20 },
  sectionDivider: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  errorContainer: { backgroundColor: 'rgba(201, 162, 39, 0.15)', padding: 12, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: Colors.warn },
  errorText: { color: Colors.textPrimary, fontSize: 13 },
  submitButton: { backgroundColor: Colors.accent, height: 56, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 40 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: Colors.bg, fontSize: 16, fontWeight: '700' }
});
