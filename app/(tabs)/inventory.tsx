import { useState, useCallback, useMemo } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  TextInput, RefreshControl, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/lib/theme';
import { useInventory } from '@/hooks/useQueries';
import { useAddStock } from '@/hooks/useMutations';
import * as Haptics from 'expo-haptics';
import { Skeleton } from '@/components/Skeleton';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';

type ProductInventory = {
  id: string;
  name: string;
  category: string;
  unit: string;
  purchase_price: number;
  sale_price: number;
  low_stock_threshold: number;
  stockCount: number;
  alternate_unit: string | null;
  conversion_factor: number | null;
};

type RawMaterial = {
  id: string;
  name: string;
  stock_quantity: number;
  unit: string;
};

type Supplier = {
  id: string;
  name: string;
  phone: string;
};

export default function InventoryScreen() {
  const router = useRouter();
  const { businessInfo } = useAuth();
  const isRestaurant = businessInfo?.business_type === 'restaurant';
  
  const { data: inventoryData, isLoading: loading, refetch, isRefetching } = useInventory(businessInfo?.id, isRestaurant);
  const products = inventoryData?.products || [];
  const rawMaterials = inventoryData?.rawMaterials || [];

  const addStockMutation = useAddStock();

  const [searchQuery, setSearchQuery] = useState('');
  
  // Tabs: 'all' | 'low_stock' | 'raw_materials'
  const [activeTab, setActiveTab] = useState<'all' | 'low_stock' | 'raw_materials'>('all');

  // Stock In Modal
  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductInventory | null>(null);
  const [addQty, setAddQty] = useState('');
  const [useAlternateUnit, setUseAlternateUnit] = useState(false);

  // Supplier Share Modal
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [itemsToShare, setItemsToShare] = useState<ProductInventory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fetchingSuppliers, setFetchingSuppliers] = useState(false);

  const fetchSuppliersForShare = async () => {
    if (!businessInfo?.id) return;
    setFetchingSuppliers(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, phone')
        .eq('business_id', businessInfo.id)
        .order('name');
      if (error) throw error;
      setSuppliers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingSuppliers(false);
    }
  };

  const openShareModal = (items: ProductInventory[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItemsToShare(items);
    setSupplierModalVisible(true);
    fetchSuppliersForShare();
  };

  const shareViaText = async (supplier: Supplier) => {
    let message = `Hello ${supplier.name},\n\nPlease supply the following items:\n`;
    itemsToShare.forEach((item, index) => {
      message += `${index + 1}. ${item.name} - Qty Required: (Low Stock: ${item.stockCount} ${item.unit})\n`;
    });
    message += `\nThank you,\n${businessInfo?.name || 'Your Shop'}`;
    
    // In India, numbers typically start with 91, but let's just strip non-digits. 
    // If supplier.phone doesn't have country code, we can prefix 91 for Indian merchants.
    let phoneStr = supplier.phone.replace(/\D/g, '');
    if (phoneStr.length === 10) phoneStr = '91' + phoneStr;
    
    const url = `whatsapp://send?phone=${phoneStr}&text=${encodeURIComponent(message)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not open WhatsApp.');
    }
    setSupplierModalVisible(false);
  };

  const shareViaPdf = async (supplier: Supplier) => {
    const html = `
      <html>
        <head>
          <style>
            body { font-family: Helvetica, sans-serif; padding: 40px; color: #1f2937; }
            .header { text-align: center; margin-bottom: 40px; }
            h1 { color: #111827; margin-bottom: 5px; }
            .details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .box { padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; width: 45%; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
            th { background-color: #f9fafb; color: #374151; font-weight: 600; }
            .footer { margin-top: 50px; font-size: 12px; color: #6b7280; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PURCHASE ORDER</h1>
            <p style="color: #6b7280;">Date: ${new Date().toLocaleDateString('en-IN')}</p>
          </div>
          <div class="details">
            <div class="box">
              <strong>From:</strong><br/>
              ${businessInfo?.name || 'Your Shop'}<br/>
              Phone: ${businessInfo?.owner_phone || ''}
            </div>
            <div class="box">
              <strong>To (Supplier):</strong><br/>
              ${supplier.name}<br/>
              Phone: ${supplier.phone}
            </div>
          </div>
          <table>
            <tr><th>#</th><th>Item Name</th><th>Category</th><th>Current Stock</th><th>Order Qty</th></tr>
            ${itemsToShare.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${item.name}</strong></td>
                <td>${item.category}</td>
                <td>${item.stockCount} ${item.unit}</td>
                <td></td>
              </tr>
            `).join('')}
          </table>
          <div class="footer">
            <p>Generated via Merchant Desk App</p>
          </div>
        </body>
      </html>
    `;
    
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Share Purchase Order' });
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to generate or share PDF.');
    }
    setSupplierModalVisible(false);
  };

  const handleStockIn = async () => {
    const qty = parseFloat(addQty);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Error', 'Please enter a valid positive quantity');
      return;
    }
    if (!selectedProduct || !businessInfo?.id) return;

    let finalQty = qty;
    if (useAlternateUnit && selectedProduct.conversion_factor) {
      finalQty = qty * selectedProduct.conversion_factor;
    }

    try {
      await addStockMutation.mutateAsync({
        businessId: businessInfo.id,
        productId: selectedProduct.id,
        quantity: finalQty
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStockModalVisible(false);
      setAddQty('');
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to add stock');
      console.error(error);
    }
  };

  const openStockModal = (product: ProductInventory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(product);
    setAddQty('');
    setUseAlternateUnit(false);
    setStockModalVisible(true);
  };

  // Derived state
  const totalValue = useMemo(() => {
    return products.reduce((sum, p) => sum + (Math.max(0, p.stockCount) * p.purchase_price), 0);
  }, [products]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => p.stockCount <= p.low_stock_threshold).length;
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    
    if (activeTab === 'low_stock') {
      result = result.filter(p => p.stockCount <= p.low_stock_threshold);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.category.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [products, activeTab, searchQuery]);

  const filteredRawMaterials = useMemo(() => {
    if (!searchQuery.trim()) return rawMaterials;
    const q = searchQuery.toLowerCase();
    return rawMaterials.filter(r => r.name.toLowerCase().includes(q));
  }, [rawMaterials, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inventory</Text>
          <Text style={styles.subtitle}>Stock Value: ₹ {totalValue.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All Items ({products.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'low_stock' && styles.activeTabLowStock]}
          onPress={() => setActiveTab('low_stock')}
        >
          <View style={styles.lowStockBadgeContainer}>
            <Text style={[styles.tabText, activeTab === 'low_stock' && styles.activeTabTextLowStock]}>
              Low Stock
            </Text>
            {lowStockCount > 0 && (
              <View style={[styles.badge, activeTab === 'low_stock' ? { backgroundColor: Colors.bg } : {}]}>
                <Text style={[styles.badgeText, activeTab === 'low_stock' ? { color: Colors.warn } : {}]}>
                  {lowStockCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        {isRestaurant && (
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'raw_materials' && styles.activeTab]}
            onPress={() => setActiveTab('raw_materials')}
          >
            <Text style={[styles.tabText, activeTab === 'raw_materials' && styles.activeTabText]}>
              Raw Materials
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items or categories..."
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
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} style={styles.itemSkeleton} />
          ))}
        </View>
      ) : activeTab === 'raw_materials' ? (
        <FlatList
          data={filteredRawMaterials}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No Raw Materials Found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.stockRow}>
                  <Text style={styles.stockValue}>
                    Stock: {item.stock_quantity} {item.unit}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>
                {activeTab === 'low_stock' ? 'No low stock items!' : 'No inventory found.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isLow = item.stockCount <= item.low_stock_threshold;
            return (
              <View style={[styles.itemCard, isLow && styles.itemCardLow]}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                  
                  <View style={styles.stockRow}>
                    <View style={styles.stockBadge}>
                      <Text style={[styles.stockValue, isLow && { color: Colors.warn }]}>
                        {item.stockCount} {item.unit}
                      </Text>
                    </View>
                    {isLow && <Text style={styles.alertText}>Low Stock!</Text>}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {isLow && (
                    <TouchableOpacity 
                      style={styles.shareIconBtn}
                      onPress={() => openShareModal([item])}
                    >
                      <Ionicons name="logo-whatsapp" size={20} color={Colors.ok} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    style={styles.addStockBtn}
                    onPress={() => openStockModal(item)}
                  >
                    <Ionicons name="add" size={20} color={Colors.accent} />
                    <Text style={styles.addStockBtnText}>Stock</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* QUICK STOCK IN MODAL */}
      <Modal visible={stockModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Restock</Text>
              <TouchableOpacity onPress={() => setStockModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.stockContext}>
              <Text style={styles.contextName}>{selectedProduct?.name}</Text>
              <Text style={styles.contextCurrent}>Current Stock: {selectedProduct?.stockCount} {selectedProduct?.unit}</Text>
            </View>
            
            {selectedProduct?.alternate_unit ? (
              <View style={[styles.formGroup, { marginBottom: 16 }]}>
                <Text style={styles.label}>Select Unit</Text>
                <View style={{ flexDirection: 'row', backgroundColor: Colors.surfaceRaised, borderRadius: 8, padding: 4 }}>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, !useAlternateUnit && styles.toggleBtnActive]} 
                    onPress={() => setUseAlternateUnit(false)}
                  >
                    <Text style={[styles.toggleBtnText, !useAlternateUnit && styles.toggleBtnTextActive]}>{selectedProduct.unit}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, useAlternateUnit && styles.toggleBtnActive]} 
                    onPress={() => setUseAlternateUnit(true)}
                  >
                    <Text style={[styles.toggleBtnText, useAlternateUnit && styles.toggleBtnTextActive]}>{selectedProduct.alternate_unit} (x{selectedProduct.conversion_factor})</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Quantity to Add ({useAlternateUnit && selectedProduct?.alternate_unit ? selectedProduct.alternate_unit : selectedProduct?.unit})</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity 
                  style={styles.stepperBtn} 
                  onPress={() => {
                    const current = parseFloat(addQty) || 0;
                    if (current > 0) setAddQty((current - 1).toString());
                  }}
                >
                  <Ionicons name="remove" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                
                <TextInput 
                  style={[styles.input, { flex: 1, fontSize: 24, fontWeight: '700', textAlign: 'center', marginHorizontal: 12 }]} 
                  value={addQty} 
                  onChangeText={setAddQty} 
                  keyboardType="numeric" 
                  placeholder="0" 
                />
                
                <TouchableOpacity 
                  style={styles.stepperBtn} 
                  onPress={() => {
                    const current = parseFloat(addQty) || 0;
                    setAddQty((current + 1).toString());
                  }}
                >
                  <Ionicons name="add" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleStockIn} disabled={addStockMutation.isPending}>
              {addStockMutation.isPending ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitBtnText}>Add Stock</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SHARE LOW STOCK MODAL */}
      <Modal visible={supplierModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order via WhatsApp</Text>
              <TouchableOpacity onPress={() => setSupplierModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={{ color: Colors.textSecondary, marginBottom: 16 }}>
              Select a supplier to order {itemsToShare.length} item(s).
            </Text>

            {fetchingSuppliers ? (
              <ActivityIndicator color={Colors.accent} style={{ marginVertical: 40 }} />
            ) : suppliers.length === 0 ? (
              <View style={{ alignItems: 'center', marginVertical: 30 }}>
                <Ionicons name="bus-outline" size={48} color={Colors.textSecondary} />
                <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>No suppliers saved.</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8 }}>
                  Go to the Suppliers tab to add a vendor first.
                </Text>
              </View>
            ) : (
              <FlatList 
                data={suppliers}
                keyExtractor={s => s.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <View style={styles.supplierCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.supplierName}>{item.name}</Text>
                      <Text style={styles.supplierPhone}>{item.phone}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity 
                        style={styles.actionBtnText} 
                        onPress={() => shareViaText(item)}
                      >
                        <Ionicons name="chatbubble-ellipses" size={18} color={Colors.bg} />
                        <Text style={{ color: Colors.bg, fontWeight: '600', fontSize: 12 }}>Text</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionBtnPdf} 
                        onPress={() => shareViaPdf(item)}
                      >
                        <Ionicons name="document-text" size={18} color={Colors.accent} />
                        <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 12 }}>PDF</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* FLOATING ACTION BUTTON */}
      {activeTab === 'low_stock' && lowStockCount > 0 && (
        <TouchableOpacity 
          style={styles.fab}
          onPress={() => {
            const lowItems = filteredProducts.filter(p => p.stockCount <= p.low_stock_threshold);
            openShareModal(lowItems);
          }}
        >
          <Ionicons name="logo-whatsapp" size={24} color={Colors.bg} />
          <Text style={styles.fabText}>Order Low Stock</Text>
        </TouchableOpacity>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 10 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.ok, fontWeight: '600', marginTop: 4 },
  
  tabsContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: Colors.surface, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: Colors.accent },
  activeTabLowStock: { backgroundColor: Colors.warn },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  activeTabText: { color: Colors.bg },
  activeTabTextLowStock: { color: Colors.bg },
  
  lowStockBadgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { backgroundColor: Colors.warn, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
  badgeText: { color: Colors.bg, fontSize: 11, fontWeight: '700' },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, marginHorizontal: 20, marginBottom: 16, paddingHorizontal: 16, height: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: Colors.textPrimary },
  
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: Colors.textSecondary, marginTop: 12, fontSize: 16 },
  
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  itemCardLow: { borderColor: 'rgba(239, 68, 68, 0.3)' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  itemCategory: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockBadge: { backgroundColor: Colors.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  stockValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  alertText: { fontSize: 12, color: Colors.warn, fontWeight: '600' },
  
  addStockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.accentDim, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
  addStockBtnText: { color: Colors.accent, fontWeight: '600', fontSize: 13 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  
  stockContext: { backgroundColor: Colors.surface, padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  contextName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  contextCurrent: { fontSize: 14, color: Colors.textSecondary },
  
  formGroup: { marginBottom: 24 },
  label: { fontSize: 13, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 16, height: 60, color: Colors.textPrimary, fontSize: 16 },
  
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  toggleBtnActive: { backgroundColor: Colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleBtnText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  toggleBtnTextActive: { color: Colors.textPrimary, fontWeight: '600' },
  
  submitBtn: { backgroundColor: Colors.accent, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: Colors.bg, fontSize: 16, fontWeight: '600' },
  
  stepperBtn: { width: 60, height: 60, backgroundColor: Colors.surface, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },

  shareIconBtn: { backgroundColor: 'rgba(34, 197, 94, 0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)' },
  
  supplierCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  supplierName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  supplierPhone: { fontSize: 13, color: Colors.textSecondary },
  actionBtnText: { backgroundColor: Colors.ok, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 4 },
  actionBtnPdf: { backgroundColor: Colors.accentDim, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 4 },
  
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: Colors.ok, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  fabText: { color: Colors.bg, fontWeight: '700', fontSize: 15 },

  skeletonContainer: { padding: 20, gap: 12 },
  itemSkeleton: { height: 90, borderRadius: 16 },
});
