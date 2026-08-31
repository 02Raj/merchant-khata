import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/lib/theme';
import { formatSaleBillNumber, getPrinterPaperSize } from '@/lib/printerSettings';
import {
  buildRetailPdfHtml,
  buildRetailThermalHtml,
  type RetailReceiptSnapshot,
} from '@/lib/retailReceipt';
import { formatPaymentModeLabel, getSalePaymentSplit } from '@/lib/salesCheckout';
import { supabase } from '@/lib/supabase';

type SaleRow = {
  id: string;
  total_amount: number;
  total_tax: number;
  payment_type: string;
  discount_amount: number;
  cash_amount: number;
  upi_amount: number;
  credit_amount: number;
  created_at: string;
  customer_name: string | null;
  customer_type: string | null;
  customer_balance: number;
};

type SaleItemRow = {
  id: string;
  product_id: string;
  quantity: number;
  returned_quantity: number;
  unit_price: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  tax_inclusive: boolean;
  is_wholesale_rate: boolean;
  product_name: string;
  hsn_code: string | null;
};

export default function SalesHistoryScreen() {
  const router = useRouter();
  const { businessInfo, session } = useAuth();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailSale, setDetailSale] = useState<SaleRow | null>(null);
  const [detailItems, setDetailItems] = useState<SaleItemRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnQtyByItem, setReturnQtyByItem] = useState<Record<string, string>>({});
  const [processingReturn, setProcessingReturn] = useState(false);

  const fetchSales = async (isRefresh = false) => {
    if (!businessInfo?.id) return;
    if (!isRefresh) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id, total_amount, total_tax, payment_type, discount_amount, cash_amount, upi_amount, credit_amount, created_at, customers(name, customer_type)')
        .eq('business_id', businessInfo.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const rows: SaleRow[] = (data || []).map((row: any) => ({
        id: row.id,
        total_amount: Number(row.total_amount),
        total_tax: Number(row.total_tax || 0),
        payment_type: row.payment_type,
        discount_amount: Number(row.discount_amount || 0),
        cash_amount: Number(row.cash_amount || 0),
        upi_amount: Number(row.upi_amount || 0),
        credit_amount: Number(row.credit_amount || 0),
        created_at: row.created_at,
        customer_name: row.customers?.name ?? null,
        customer_type: row.customers?.customer_type ?? null,
        customer_balance: 0,
      }));

      setSales(rows);
    } catch (error) {
      console.error('Failed to load sales history', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSaleDetail = async (sale: SaleRow) => {
    setDetailSale(sale);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select('id, product_id, quantity, returned_quantity, unit_price, subtotal, tax_rate, tax_amount, tax_inclusive, is_wholesale_rate, products(name, hsn_code)')
        .eq('sale_id', sale.id);

      if (error) throw error;

      const items: SaleItemRow[] = (data || []).map((row: any) => ({
        id: row.id,
        product_id: row.product_id,
        quantity: Number(row.quantity),
        returned_quantity: Number(row.returned_quantity || 0),
        unit_price: Number(row.unit_price),
        subtotal: Number(row.subtotal),
        tax_rate: Number(row.tax_rate || 0),
        tax_amount: Number(row.tax_amount || 0),
        tax_inclusive: !!row.tax_inclusive,
        is_wholesale_rate: !!row.is_wholesale_rate,
        product_name: row.products?.name || 'Item',
        hsn_code: row.products?.hsn_code ?? null,
      }));

      setDetailItems(items);
      const initialQty: Record<string, string> = {};
      items.forEach((item) => {
        const remaining = item.quantity - item.returned_quantity;
        if (remaining > 0) initialQty[item.id] = '';
      });
      setReturnQtyByItem(initialQty);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load bill details');
      setDetailSale(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const buildSnapshotFromSale = (sale: SaleRow, items: SaleItemRow[]): RetailReceiptSnapshot => {
    const paymentSplit = getSalePaymentSplit(sale);

    return {
      saleId: sale.id,
      date: new Date(sale.created_at).toLocaleString('en-IN'),
      customer: sale.customer_name
        ? { name: sale.customer_name, customer_type: sale.customer_type || undefined, balance: sale.customer_balance }
        : null,
      paymentType: sale.payment_type,
      paymentSplit,
      discountAmount: sale.discount_amount,
      totals: {
        grandTotal: sale.total_amount,
        taxTotal: sale.total_tax,
        itemsForRpc: items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          tax_rate: item.tax_rate,
          tax_amount: item.tax_amount,
          tax_inclusive: item.tax_inclusive,
          product: { name: item.product_name, hsn_code: item.hsn_code },
          displayQty: item.quantity,
          is_wholesale_rate: item.is_wholesale_rate,
        })),
      },
    };
  };

  const reprintBill = async (mode: 'thermal' | 'pdf') => {
    if (!detailSale) return;
    const snapshot = buildSnapshotFromSale(detailSale, detailItems);
    try {
      if (mode === 'thermal') {
        const paperSize = await getPrinterPaperSize();
        const html = buildRetailThermalHtml(snapshot, {
          name: businessInfo?.name,
          gstin: businessInfo?.gstin,
          businessType: businessInfo?.business_type,
        }, paperSize);
        await Print.printAsync({ html });
      } else {
        const html = buildRetailPdfHtml(snapshot, {
          name: businessInfo?.name,
          gstin: businessInfo?.gstin,
          businessType: businessInfo?.business_type,
        });
        const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
      }
    } catch (error: any) {
      Alert.alert('Print failed', error.message || 'Could not print bill');
    }
  };

  const submitReturn = async () => {
    if (!detailSale || !businessInfo?.id || !session?.uid) return;

    const items = detailItems
      .map((item) => ({
        sale_item_id: item.id,
        quantity: Number(returnQtyByItem[item.id] || 0),
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      Alert.alert('Return', 'Enter quantity for at least one item.');
      return;
    }

    setProcessingReturn(true);
    try {
      const { error } = await supabase.rpc('process_sale_return', {
        p_business_id: businessInfo.id,
        p_sale_id: detailSale.id,
        p_created_by: session.uid,
        p_items: items,
      });
      if (error) throw error;

      Alert.alert('Success', 'Return recorded and stock restored.');
      setReturnModalVisible(false);
      setDetailSale(null);
      void fetchSales(true);
    } catch (error: any) {
      Alert.alert('Return failed', error.message || 'Could not process return');
    } finally {
      setProcessingReturn(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void fetchSales();
    }, [businessInfo?.id]),
  );

  const paymentLabelForRow = (sale: SaleRow) => {
    if (sale.payment_type === 'partial') {
      return formatPaymentModeLabel(getSalePaymentSplit(sale));
    }
    return sale.payment_type.toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Sales History</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchSales(true);
              }}
              tintColor={Colors.accent}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No sales recorded yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => void loadSaleDetail(item)}>
              <View style={styles.cardTop}>
                <Text style={styles.billNo}>#{formatSaleBillNumber(item.id)}</Text>
                <Text style={styles.amount}>₹{item.total_amount.toFixed(2)}</Text>
              </View>
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleString('en-IN')} · {paymentLabelForRow(item)}
              </Text>
              <Text style={styles.customer}>{item.customer_name || 'Walk-in'}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!detailSale} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setDetailSale(null)}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>
              {detailSale ? `#${formatSaleBillNumber(detailSale.id)}` : 'Bill'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {detailLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.accent} />
            </View>
          ) : detailSale ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Text style={styles.detailMeta}>{paymentLabelForRow(detailSale)}</Text>
              <Text style={styles.detailMeta}>{detailSale.customer_name || 'Walk-in'}</Text>
              {detailSale.discount_amount > 0 ? (
                <Text style={styles.detailMeta}>Discount: ₹{detailSale.discount_amount.toFixed(2)}</Text>
              ) : null}

              {detailItems.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.product_name}</Text>
                  <Text style={styles.itemMeta}>
                    Qty {item.quantity}
                    {item.returned_quantity > 0 ? ` · Returned ${item.returned_quantity}` : ''}
                  </Text>
                  <Text style={styles.itemAmount}>₹{item.subtotal.toFixed(2)}</Text>
                </View>
              ))}

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => void reprintBill('thermal')}>
                  <Ionicons name="print-outline" size={18} color={Colors.bg} />
                  <Text style={styles.actionBtnText}>Reprint</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnSecondary} onPress={() => void reprintBill('pdf')}>
                  <Ionicons name="share-outline" size={18} color={Colors.accent} />
                  <Text style={styles.actionBtnSecondaryText}>Share PDF</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.returnBtn} onPress={() => setReturnModalVisible(true)}>
                <Ionicons name="return-down-back-outline" size={18} color={Colors.warn} />
                <Text style={styles.returnBtnText}>Process Return</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal visible={returnModalVisible} animationType="fade" transparent>
        <View style={styles.returnOverlay}>
          <View style={styles.returnSheet}>
            <Text style={styles.returnTitle}>Return Items</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {detailItems.map((item) => {
                const remaining = item.quantity - item.returned_quantity;
                if (remaining <= 0) return null;
                return (
                  <View key={item.id} style={styles.returnItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.product_name}</Text>
                      <Text style={styles.itemMeta}>Max return: {remaining}</Text>
                    </View>
                    <TextInput
                      style={styles.returnQtyInput}
                      value={returnQtyByItem[item.id] || ''}
                      onChangeText={(text) => setReturnQtyByItem((prev) => ({ ...prev, [item.id]: text }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.returnActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReturnModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => void submitReturn()} disabled={processingReturn}>
                {processingReturn ? (
                  <ActivityIndicator color={Colors.bg} />
                ) : (
                  <Text style={styles.actionBtnText}>Confirm Return</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  billNo: { fontWeight: '700', color: Colors.textPrimary },
  amount: { fontWeight: '700', color: Colors.accent },
  meta: { color: Colors.textSecondary, fontSize: 12, marginBottom: 4 },
  customer: { color: Colors.textPrimary, fontSize: 14 },
  emptyText: { color: Colors.textSecondary },
  detailContent: { padding: 16, gap: 12 },
  detailMeta: { color: Colors.textSecondary, fontSize: 14 },
  itemRow: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  itemMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: Colors.accent, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    padding: 14,
    borderRadius: 12,
  },
  actionBtnText: { color: Colors.bg, fontWeight: '700' },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: 14,
    borderRadius: 12,
  },
  actionBtnSecondaryText: { color: Colors.accent, fontWeight: '700' },
  returnBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warn,
    marginTop: 4,
  },
  returnBtnText: { color: Colors.warn, fontWeight: '700' },
  returnOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  returnSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  returnTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  returnItemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  returnQtyInput: {
    width: 72,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    textAlign: 'center',
    color: Colors.textPrimary,
    backgroundColor: Colors.bg,
  },
  returnActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textPrimary, fontWeight: '600' },
});
