import { useState, useCallback, useMemo } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  TextInput, RefreshControl, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import * as Haptics from 'expo-haptics';
import { Skeleton } from '@/components/Skeleton';

type ProductInventory = {
  id: string;
  name: string;
  category: string;
  unit: string;
  purchase_price: number;
  sale_price: number;
  low_stock_threshold: number;
  stockCount: number;
};

export default function InventoryScreen() {
  const { businessInfo } = useAuth();
  
  const [products, setProducts] = useState<ProductInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tabs: 'all' | 'low_stock'
  const [activeTab, setActiveTab] = useState<'all' | 'low_stock'>('all');

  // Stock In Modal
  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductInventory | null>(null);
  const [addQty, setAddQty] = useState('');
  const [addingStock, setAddingStock] = useState(false);

  const fetchInventory = async (isRefreshing = false) => {
    if (!businessInfo?.id) return;
    if (!isRefreshing) setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, category, unit, purchase_price, sale_price, low_stock_threshold,
          inventory_transactions (quantity_change)
        `)
        .eq('business_id', businessInfo.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const processed: ProductInventory[] = (data || []).map((p: any) => {
        const stock = p.inventory_transactions?.reduce((sum: number, txn: any) => sum + Number(txn.quantity_change), 0) || 0;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          unit: p.unit,
          purchase_price: Number(p.purchase_price),
          sale_price: Number(p.sale_price),
          low_stock_threshold: p.low_stock_threshold ? Number(p.low_stock_threshold) : 5,
          stockCount: stock
        };
      });

      setProducts(processed);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
    }, [businessInfo])
  );

  const handleStockIn = async () => {
    const qty = parseFloat(addQty);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Error', 'Please enter a valid positive quantity');
      return;
    }
    if (!selectedProduct) return;

    setAddingStock(true);
    try {
      const { error } = await supabase
        .from('inventory_transactions')
        .insert({
          business_id: businessInfo!.id,
          product_id: selectedProduct.id,
          quantity_change: qty,
          reason: 'Quick Restock',
          source_type: 'adjustment',
          source_id: selectedProduct.id // Using product ID as dummy source
        });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStockModalVisible(false);
      setAddQty('');
      // Optimistic update
      setProducts(prev => prev.map(p => 
        p.id === selectedProduct.id ? { ...p, stockCount: p.stockCount + qty } : p
      ));
      
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to add stock');
      console.error(error);
    } finally {
      setAddingStock(false);
    }
  };

  const openStockModal = (product: ProductInventory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(product);
    setAddQty('');
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
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchInventory(true)} tintColor={Colors.accent} />}
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

                <TouchableOpacity 
                  style={styles.addStockBtn}
                  onPress={() => openStockModal(item)}
                >
                  <Ionicons name="add" size={20} color={Colors.accent} />
                  <Text style={styles.addStockBtnText}>Stock</Text>
                </TouchableOpacity>
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
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Quantity to Add ({selectedProduct?.unit})</Text>
              <TextInput 
                style={[styles.input, { fontSize: 24, fontWeight: '700' }]} 
                value={addQty} 
                onChangeText={setAddQty} 
                keyboardType="numeric" 
                placeholder="0" 
                autoFocus
              />
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleStockIn} disabled={addingStock}>
              {addingStock ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.submitBtnText}>Add Stock</Text>}
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
  
  submitBtn: { backgroundColor: Colors.accent, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: Colors.bg, fontSize: 16, fontWeight: '600' },

  skeletonContainer: { padding: 20, gap: 12 },
  itemSkeleton: { height: 90, borderRadius: 16 },
});
