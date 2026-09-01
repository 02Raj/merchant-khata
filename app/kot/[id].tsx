import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import * as Haptics from 'expo-haptics';
import { generateReceiptHTML, generateKOTHTML } from '@/lib/printTemplate';
import { getPrinterPaperSize } from '@/lib/printerSettings';
import { safePrintAsync } from '@/lib/safePrint';

// Types
type Product = {
  id: string;
  name: string;
  sale_price: number;
  gst_rate: number;
  tax_inclusive: boolean;
  is_available_today: boolean;
};

type Variant = {
  id: string;
  product_id: string;
  name: string;
  price: number;
};

type Modifier = {
  id: string;
  product_id: string;
  name: string;
  extra_price: number;
};

type OrderItem = {
  id?: string; // missing if not saved yet
  product: Product;
  variant?: Variant;
  modifiers: Modifier[];
  qty: number;
  unit_price: number;
  kot_number?: number | null;
  status: 'pending' | 'sent' | 'cancelled';
  notes: string;
};

type CancelRequest = {
  id: string;
  order_item_id: string;
  reason: string;
  status: string;
};

type Order = {
  id: string;
  table_id: string | null;
  status: 'open' | 'billed' | 'paid' | 'cancelled';
  kot_count: number;
  type: 'dine_in' | 'takeaway';
  total_amount: number;
  invoice_number?: number;
};

export default function KOTScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { businessInfo, session } = useAuth();
  const role = businessInfo?.role;
  
  const isNew = params.id === 'new';
  const tableId = params.tableId as string | undefined;
  const tableName = params.tableName as string | undefined;
  const orderType = (params.type as 'dine_in' | 'takeaway') || 'dine_in';
  const orderId = isNew ? null : (params.id as string);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [resolvedTableName, setResolvedTableName] = useState<string | undefined>(tableName);
  
  const effectiveOrderType = order?.type ?? orderType;
  const displayTableName = effectiveOrderType === 'takeaway' ? undefined : (resolvedTableName || tableName);
  
  // Menu Data
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  
  // Cart/Items State
  const [items, setItems] = useState<OrderItem[]>([]);
  const [cancelRequests, setCancelRequests] = useState<CancelRequest[]>([]);
  
  // Bottom Sheet State for adding items with variants/modifiers
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  const [qty, setQty] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);

  // Billing Modal
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [processingBill, setProcessingBill] = useState(false);

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelTargetItem, setCancelTargetItem] = useState<OrderItem | null>(null);

  const calcBillableTotal = useCallback(
    (orderItems: OrderItem[]) =>
      orderItems
        .filter((item) => item.status !== 'cancelled')
        .reduce((sum, item) => sum + item.unit_price * item.qty, 0),
    [],
  );

  useEffect(() => {
    fetchData();
  }, [orderId]);

  const fetchData = async () => {
    if (!businessInfo) return;
    setLoading(true);
    try {
      // Fetch Menu
      const [pRes, vRes, mRes] = await Promise.all([
        supabase.from('products').select('id, name, sale_price, gst_rate, tax_inclusive, is_available_today').eq('business_id', businessInfo.id).eq('is_active', true),
        supabase.from('product_variants').select('*'), // Filtered via RLS
        supabase.from('modifiers').select('*') // Filtered via RLS
      ]);
      
      if (pRes.data) {
        setProducts(
          pRes.data.map((product) => ({
            ...product,
            sale_price: Number(product.sale_price),
            gst_rate: Number(product.gst_rate) || 0,
            tax_inclusive: product.tax_inclusive ?? true,
          })),
        );
      }
      if (vRes.data) setVariants(vRes.data);
      if (mRes.data) setModifiers(mRes.data);

      // Fetch Order if exists
      if (orderId) {
        const { data: oData, error: oErr } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (oErr) throw oErr;
        setOrder(oData);

        if (oData.table_id) {
          const { data: tableData } = await supabase
            .from('tables')
            .select('name')
            .eq('id', oData.table_id)
            .single();
          if (tableData?.name) {
            setResolvedTableName(tableData.name);
          }
        } else {
          setResolvedTableName(undefined);
        }

        const { data: iData, error: iErr } = await supabase.from('order_items').select('*').eq('order_id', orderId);
        if (iErr) throw iErr;
        
        // Map DB items to UI items
        if (iData && pRes.data) {
          const mappedItems: OrderItem[] = iData.map(dbItem => {
            const prod = pRes.data!.find(p => p.id === dbItem.product_id)!;
            const variant = vRes.data?.find(v => v.id === dbItem.product_variant_id);
            const itemMods = (dbItem.modifier_ids || []).map((mid: string) => mRes.data?.find(m => m.id === mid)).filter(Boolean) as Modifier[];
            
            return {
              id: dbItem.id,
              product: {
                ...prod,
                sale_price: Number(prod.sale_price),
                gst_rate: Number(prod.gst_rate) || 0,
                tax_inclusive: prod.tax_inclusive ?? true,
              },
              variant,
              modifiers: itemMods,
              qty: dbItem.qty,
              unit_price: Number(dbItem.unit_price),
              kot_number: dbItem.kot_number,
              status: dbItem.status,
              notes: dbItem.notes || ''
            };
          });
          setItems(mappedItems);

          // Fetch Cancel Requests
          const itemIds = iData.map(i => i.id);
          if (itemIds.length > 0) {
            const { data: cData } = await supabase.from('cancel_requests').select('*').in('order_item_id', itemIds).eq('status', 'pending');
            if (cData) setCancelRequests(cData);
          }
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const openProductModal = (product: Product) => {
    if (!product.is_available_today) {
      Alert.alert('Unavailable', 'This item is not available today.');
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(product);
    
    const prodVariants = variants.filter(v => v.product_id === product.id);
    setSelectedVariant(prodVariants.length > 0 ? prodVariants[0] : null);
    
    setSelectedModifiers([]);
    setItemNotes('');
    setQty(1);
    setModalVisible(true);
  };

  const toggleModifier = (mod: Modifier) => {
    Haptics.selectionAsync();
    setSelectedModifiers(prev => {
      if (prev.find(m => m.id === mod.id)) {
        return prev.filter(m => m.id !== mod.id);
      } else {
        return [...prev, mod];
      }
    });
  };

  const addToCart = () => {
    if (!selectedProduct) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    let unit_price = selectedVariant ? selectedVariant.price : selectedProduct.sale_price;
    selectedModifiers.forEach(m => unit_price += Number(m.extra_price));

    const newItem: OrderItem = {
      product: selectedProduct,
      variant: selectedVariant || undefined,
      modifiers: selectedModifiers,
      qty,
      unit_price,
      status: 'pending',
      notes: itemNotes
    };

    setItems(prev => [...prev, newItem]);
    setModalVisible(false);
  };

  const sendKOT = async () => {
    const pendingItems = items.filter(i => i.status === 'pending');
    if (pendingItems.length === 0) {
      Alert.alert('Info', 'No pending items to send.');
      return;
    }

    try {
      setLoading(true);
      let currentOrderId = order?.id;
      let newKotCount = (order?.kot_count || 0) + 1;

      // 1. Create order if it doesn't exist
      if (!currentOrderId) {
        const { data: newOrder, error } = await supabase.from('orders').insert({
          business_id: businessInfo!.id,
          table_id: tableId || null,
          type: orderType,
          status: 'open',
          kot_count: newKotCount,
          waiter_id: session?.uid
        }).select().single();
        if (error) throw error;
        currentOrderId = newOrder.id;
        setOrder(newOrder);
      } else {
        // Update order kot_count
        await supabase.from('orders').update({ kot_count: newKotCount }).eq('id', currentOrderId);
      }

      // 2. Insert items
      const insertData = pendingItems.map(item => ({
        order_id: currentOrderId,
        product_id: item.product.id,
        product_variant_id: item.variant?.id || null,
        modifier_ids: item.modifiers.map(m => m.id),
        qty: item.qty,
        unit_price: item.unit_price,
        kot_number: newKotCount,
        status: 'sent',
        notes: item.notes
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(insertData);
      if (itemsErr) throw itemsErr;

      const updatedItems = items.map((item) =>
        item.status === 'pending'
          ? { ...item, status: 'sent' as const, kot_number: newKotCount }
          : item,
      );
      const totalAmount = calcBillableTotal(updatedItems);
      await supabase.from('orders').update({
        kot_count: newKotCount,
        total_amount: totalAmount,
      }).eq('id', currentOrderId);

      // Print KOT
      try {
        const paperSize = await getPrinterPaperSize();
        const orderDataToPrint = {
          type: effectiveOrderType,
          kot_count: newKotCount,
        };
        const html = generateKOTHTML(orderDataToPrint, pendingItems, displayTableName, paperSize);
        await safePrintAsync({ html });
      } catch (printErr) {
        console.error('KOT Print Failed', printErr);
      }

      setItems(updatedItems);
      setOrder((prev) => prev
        ? { ...prev, kot_count: newKotCount, total_amount: totalAmount }
        : {
            id: currentOrderId!,
            table_id: tableId || null,
            status: 'open',
            kot_count: newKotCount,
            type: orderType,
            total_amount: totalAmount,
          });
      Alert.alert('Success', `KOT #${newKotCount} Sent to Kitchen!`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const openCancelModal = (item: OrderItem) => {
    setCancelTargetItem(item);
    setCancelReason('');
    setCancelModalVisible(true);
  };

  const submitCancelRequest = async () => {
    if (!cancelTargetItem?.id) return;
    if (!cancelReason.trim()) {
      Alert.alert('Error', 'Reason is required');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.from('cancel_requests').insert({
        order_item_id: cancelTargetItem.id,
        reason: cancelReason.trim(),
        status: 'pending',
        requested_by: session?.uid,
      }).select().single();
      if (error) throw error;
      setCancelRequests([...cancelRequests, data]);
      setCancelModalVisible(false);
      setCancelTargetItem(null);
      setCancelReason('');
      Alert.alert('Sent', 'Cancel request sent to owner.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const requestCancelItem = (item: OrderItem) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Cancel Item',
        'Reason for cancellation?',
        [
          { text: 'Back', style: 'cancel' },
          {
            text: 'Send Request',
            onPress: async (reason?: string) => {
              if (!reason?.trim()) {
                Alert.alert('Error', 'Reason is required');
                return;
              }
              try {
                setLoading(true);
                const { data, error } = await supabase.from('cancel_requests').insert({
                  order_item_id: item.id!,
                  reason: reason.trim(),
                  status: 'pending',
                  requested_by: session?.uid,
                }).select().single();
                if (error) throw error;
                setCancelRequests([...cancelRequests, data]);
                Alert.alert('Sent', 'Cancel request sent to owner.');
              } catch (e: any) {
                Alert.alert('Error', e.message);
              } finally {
                setLoading(false);
              }
            },
          },
        ],
      );
      return;
    }

    openCancelModal(item);
  };

  const approveCancel = async (cr: CancelRequest, item: OrderItem) => {
    try {
      setLoading(true);
      
      const updatedItems = items.map((i) => (i.id === item.id ? { ...i, status: 'cancelled' as const } : i));
      const newTotal = calcBillableTotal(updatedItems);

      await supabase.from('order_items').update({ status: 'cancelled' }).eq('id', item.id);
      
      // Update request status
      await supabase.from('cancel_requests').update({ 
        status: 'approved', 
        approved_by: session?.uid 
      }).eq('id', cr.id);

      if (order?.id) {
        await supabase.from('orders').update({ total_amount: newTotal }).eq('id', order.id);
      }
      
      // Update local state
      setItems(updatedItems);
      setOrder((prev) => (prev ? { ...prev, total_amount: newTotal } : prev));
      setCancelRequests(cancelRequests.filter(r => r.id !== cr.id));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch(e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const rejectCancel = async (cr: CancelRequest) => {
    try {
      setLoading(true);
      await supabase.from('cancel_requests').update({ 
        status: 'rejected', 
        approved_by: session?.uid 
      }).eq('id', cr.id);
      
      setCancelRequests(cancelRequests.filter(r => r.id !== cr.id));
    } catch(e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const billableGrandTotal = useMemo(
    () => calcBillableTotal(items),
    [calcBillableTotal, items],
  );
  const grandTotal = billableGrandTotal;

  const handleGenerateBill = async () => {
    if (!order?.id) {
      Alert.alert('Warning', 'Please send KOT first to create the order.');
      return;
    }
    if (items.filter(i => i.status === 'pending').length > 0) {
      Alert.alert('Warning', 'You have pending items. Please Send KOT first.');
      return;
    }
    if (items.filter(i => i.status !== 'cancelled').length === 0) {
      Alert.alert('Warning', 'No billable items on this order.');
      return;
    }
    
    try {
      setProcessingBill(true);
      
      const { data: maxInvData } = await supabase
        .from('orders')
        .select('invoice_number')
        .eq('business_id', businessInfo!.id)
        .not('invoice_number', 'is', null)
        .order('invoice_number', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      const nextInv = (maxInvData?.invoice_number || 0) + 1;

      const { error } = await supabase.from('orders').update({
        status: 'billed',
        invoice_number: nextInv,
        total_amount: billableGrandTotal,
      }).eq('id', order.id);

      if (error) throw error;

      const billedOrder = { ...order, status: 'billed' as const, invoice_number: nextInv, total_amount: billableGrandTotal };
      Alert.alert('Billed', `Bill generated. Invoice #${nextInv}`);
      setOrder(billedOrder);
      
      // Auto-print bill (cancel is OK — bill is already saved)
      try {
        const paperSize = await getPrinterPaperSize();
        const billableItems = items.filter((item) => item.status !== 'cancelled');
        const html = generateReceiptHTML(
          businessInfo!,
          { ...billedOrder, type: effectiveOrderType },
          billableItems,
          billableGrandTotal,
          displayTableName,
          paperSize,
        );
        await safePrintAsync({ html });
      } catch (printErr: any) {
        Alert.alert('Bill Saved', `Invoice #${nextInv} saved. Print failed: ${printErr.message}`);
      }
      
    } catch(e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setProcessingBill(false);
    }
  };

  const handleReopenBill = async () => {
    if (!order) return;
    try {
      setProcessingBill(true);
      const { error } = await supabase.from('orders').update({
        status: 'open',
        invoice_number: null,
        total_amount: billableGrandTotal,
      }).eq('id', order!.id);

      if (error) throw error;

      Alert.alert('Success', 'Bill re-opened. You can now add more items.');
      setOrder({ ...order!, status: 'open', invoice_number: undefined, total_amount: billableGrandTotal });
    } catch(e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setProcessingBill(false);
    }
  };

  const handleReprint = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!order) return;
    try {
      const paperSize = await getPrinterPaperSize();
      const billableItems = items.filter((item) => item.status !== 'cancelled');
      const html = generateReceiptHTML(
        businessInfo!,
        { ...order, type: effectiveOrderType },
        billableItems,
        billableGrandTotal,
        displayTableName,
        paperSize,
      );
      const result = await safePrintAsync({ html });
      if (result === 'cancelled') return;
    } catch (e: any) {
      Alert.alert('Print Error', e.message);
    }
  };

  const handleReprintKOT = async () => {
    if (!order?.kot_count) {
      Alert.alert('Info', 'No KOT has been sent yet.');
      return;
    }

    const kotItems = items.filter(
      (item) => item.kot_number === order.kot_count && item.status !== 'cancelled',
    );
    if (kotItems.length === 0) {
      Alert.alert('Info', 'No items found for the latest KOT.');
      return;
    }

    try {
      const paperSize = await getPrinterPaperSize();
      const html = generateKOTHTML(
        { type: effectiveOrderType, kot_count: order.kot_count },
        kotItems,
        displayTableName,
        paperSize,
      );
      const result = await safePrintAsync({ html });
      if (result === 'cancelled') return;
    } catch (e: any) {
      Alert.alert('Print Error', e.message);
    }
  };

  const openSettleModal = () => {
    setCashAmount('');
    setUpiAmount(billableGrandTotal.toFixed(2));
    setBillModalVisible(true);
  };

  const settlePayment = async () => {
    if (!order) return;
    const cash = Number(cashAmount) || 0;
    const upi = Number(upiAmount) || 0;
    const totalPaid = cash + upi;
    const expected = billableGrandTotal;

    if (totalPaid < expected) {
      Alert.alert('Error', 'Payment is less than total bill amount.');
      return;
    }

    try {
      setProcessingBill(true);
      
      const { error } = await supabase.from('orders').update({
        status: 'paid',
        total_amount: expected,
      }).eq('id', order!.id);
      
      if (error) throw error;

      // Insert into sales table to update Daybook
      const salesEntries = [];
      if (cash > 0) {
        salesEntries.push({
          business_id: businessInfo!.id,
          created_by: session?.uid,
          total_amount: cash,
          payment_type: 'cash'
        });
      }
      if (upi > 0) {
        salesEntries.push({
          business_id: businessInfo!.id,
          created_by: session?.uid,
          total_amount: upi,
          payment_type: 'upi'
        });
      }

      if (salesEntries.length > 0) {
        const { error: salesError } = await supabase.from('sales').insert(salesEntries);
        if (salesError) console.error("Failed to update daybook", salesError);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Bill Paid and Settled!');
      setBillModalVisible(false);
      router.back();
    } catch(e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setProcessingBill(false);
    }
  };

  if (loading && !order && !isNew) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.accent}/></View>;
  }

  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {effectiveOrderType === 'takeaway' ? 'Takeaway' : (displayTableName || 'Table')}
          </Text>
          <Text style={styles.headerSub}>
            {order?.status.toUpperCase() || 'NEW'} {order?.invoice_number ? `| INV-${order.invoice_number}` : ''}
          </Text>
        </View>
        <Text style={styles.totalText}>₹{grandTotal.toFixed(2)}</Text>
      </View>

      <View style={styles.body}>
        {/* Left Side: Menu (Products) */}
        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>Menu</Text>
          <FlatList
            data={products}
            keyExtractor={p => p.id}
            numColumns={2}
            renderItem={({item}) => (
              <TouchableOpacity 
                style={[styles.productCard, !item.is_available_today && styles.productDisabled]}
                onPress={() => openProductModal(item)}
              >
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>₹{item.sale_price}</Text>
                {!item.is_available_today && <Text style={styles.outOfStock}>86'd</Text>}
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Right Side: Current KOT items */}
        <View style={styles.cartContainer}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          <ScrollView>
            {items.map((item, idx) => {
              const pendingCancel = cancelRequests.find(cr => cr.order_item_id === item.id);
              
              return (
                <View key={idx} style={[
                  styles.cartItem, 
                  item.status === 'sent' && styles.cartItemSent,
                  item.status === 'cancelled' && { opacity: 0.5 }
                ]}>
                  <View style={styles.cartItemRow}>
                    <Text style={[styles.cartItemName, item.status === 'cancelled' && { textDecorationLine: 'line-through' }]}>{item.qty} x {item.product.name}</Text>
                    <Text style={styles.cartItemPrice}>₹{item.unit_price * item.qty}</Text>
                  </View>
                  {item.variant && <Text style={styles.cartItemSub}>Size: {item.variant.name}</Text>}
                  {item.modifiers.length > 0 && (
                    <Text style={styles.cartItemSub}>Add: {item.modifiers.map(m => m.name).join(', ')}</Text>
                  )}
                  {item.notes ? <Text style={styles.cartItemSub}>Note: {item.notes}</Text> : null}
                  
                  <View style={styles.cartItemRow}>
                    <Text style={[styles.statusBadge, item.status === 'sent' ? styles.badgeSent : item.status === 'cancelled' ? { backgroundColor: Colors.warn } : styles.badgePending]}>
                      {item.status.toUpperCase()}
                    </Text>

                    {/* Waiter: Request Cancel */}
                    {role === 'waiter' && item.status === 'sent' && order?.status === 'open' && !pendingCancel && (
                      <TouchableOpacity onPress={() => requestCancelItem(item)}>
                        <Text style={{ color: Colors.warn, fontSize: 12, fontWeight: 'bold' }}>Cancel?</Text>
                      </TouchableOpacity>
                    )}
                    
                    {/* Waiter: Pending Request */}
                    {role === 'waiter' && pendingCancel && (
                      <Text style={{ color: Colors.warn, fontSize: 12 }}>Cancel Pending</Text>
                    )}
                  </View>

                  {/* Owner: Approve/Reject Cancel */}
                  {role !== 'waiter' && pendingCancel && (
                    <View style={styles.cancelRequestBox}>
                      <Text style={styles.cancelReason}>Cancel Reason: {pendingCancel.reason}</Text>
                      <View style={styles.cancelActions}>
                        <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: Colors.warn }]} onPress={() => approveCancel(pendingCancel, item)}>
                          <Text style={styles.cancelBtnText}>Approve Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]} onPress={() => rejectCancel(pendingCancel)}>
                          <Text style={[styles.cancelBtnText, { color: Colors.textPrimary }]}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            {items.length === 0 && (
              <Text style={styles.emptyCartText}>No items added yet</Text>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionFooter}>
            {order?.status !== 'billed' && order?.status !== 'paid' && (
              <TouchableOpacity 
                style={[styles.sendKotBtn, pendingCount === 0 && styles.btnDisabled]} 
                onPress={sendKOT}
                disabled={pendingCount === 0 || loading}
              >
                {loading ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.btnText}>Send KOT ({pendingCount})</Text>}
              </TouchableOpacity>
            )}

            {role !== 'waiter' && order?.status === 'open' && order?.id && (
              <TouchableOpacity style={styles.billBtn} onPress={handleGenerateBill}>
                <Text style={styles.btnText}>Generate Bill</Text>
              </TouchableOpacity>
            )}

            {role !== 'waiter' && order?.status === 'billed' && (
              <TouchableOpacity style={styles.payBtn} onPress={openSettleModal}>
                <Text style={styles.btnText}>Settle Payment</Text>
              </TouchableOpacity>
            )}

            {role !== 'waiter' && (order?.status === 'billed' || order?.status === 'paid') && (
              <View style={styles.secondaryActions}>
                <TouchableOpacity style={styles.secondaryBtnHalf} onPress={handleReprint}>
                  <Text style={styles.secondaryBtnText} numberOfLines={1}>Reprint Bill</Text>
                </TouchableOpacity>
                {(order?.kot_count || 0) > 0 && (
                  <TouchableOpacity style={styles.secondaryBtnHalf} onPress={handleReprintKOT}>
                    <Text style={styles.secondaryBtnText} numberOfLines={1}>Reprint KOT</Text>
                  </TouchableOpacity>
                )}
                {order?.status === 'billed' && (
                  <TouchableOpacity style={styles.secondaryBtnFull} onPress={handleReopenBill}>
                    <Text style={styles.secondaryBtnText}>Re-open Bill</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Item Variant/Modifier Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedProduct?.name}</Text>
            
            {/* Variants */}
            {selectedProduct && variants.filter(v => v.product_id === selectedProduct.id).length > 0 && (
              <>
                <Text style={styles.modalSub}>Select Size/Variant</Text>
                <View style={styles.chipContainer}>
                  {variants.filter(v => v.product_id === selectedProduct.id).map(v => (
                    <TouchableOpacity 
                      key={v.id} 
                      style={[styles.chip, selectedVariant?.id === v.id && styles.chipSelected]}
                      onPress={() => setSelectedVariant(v)}
                    >
                      <Text style={[styles.chipText, selectedVariant?.id === v.id && styles.chipTextSelected]}>
                        {v.name} (₹{v.price})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Modifiers */}
            {selectedProduct && modifiers.filter(m => m.product_id === selectedProduct.id).length > 0 && (
              <>
                <Text style={styles.modalSub}>Add-ons</Text>
                <View style={styles.chipContainer}>
                  {modifiers.filter(m => m.product_id === selectedProduct.id).map(m => {
                    const isSelected = selectedModifiers.find(mod => mod.id === m.id);
                    return (
                      <TouchableOpacity 
                        key={m.id} 
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => toggleModifier(m)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {m.name} (+₹{m.extra_price})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Quantity & Notes */}
            <View style={styles.qtyRow}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(Math.max(1, qty - 1))}>
                <Ionicons name="remove" size={24} color={Colors.bg} />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{qty}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(qty + 1)}>
                <Ionicons name="add" size={24} color={Colors.bg} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder="Kitchen Notes (e.g., Less spicy)"
              placeholderTextColor={Colors.textSecondary}
              value={itemNotes}
              onChangeText={setItemNotes}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={addToCart}>
                <Text style={styles.addBtnText}>Add to Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Split Tender Payment Modal */}
      <Modal visible={billModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Settle Payment</Text>
            <Text style={styles.totalPayText}>Total: ₹{billableGrandTotal.toFixed(2)}</Text>
            
            <Text style={styles.modalSub}>Cash Amount</Text>
            <TextInput style={styles.notesInput} keyboardType="numeric" placeholder="₹0.00" placeholderTextColor={Colors.textSecondary} value={cashAmount} onChangeText={setCashAmount} />
            
            <Text style={styles.modalSub}>UPI Amount</Text>
            <TextInput style={styles.notesInput} keyboardType="numeric" placeholder="₹0.00" placeholderTextColor={Colors.textSecondary} value={upiAmount} onChangeText={setUpiAmount} />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setBillModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={settlePayment} disabled={processingBill}>
                {processingBill ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.addBtnText}>Settle Bill</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel reason modal (Android + fallback) */}
      <Modal visible={cancelModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cancel Item</Text>
            <Text style={styles.modalSub}>Reason for cancellation?</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. Customer changed mind"
              placeholderTextColor={Colors.textSecondary}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setCancelModalVisible(false);
                  setCancelTargetItem(null);
                  setCancelReason('');
                }}
              >
                <Text style={styles.modalCancelBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={submitCancelRequest} disabled={loading}>
                {loading ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.addBtnText}>Send Request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  headerTitleContainer: { flex: 1, marginLeft: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textSecondary },
  totalText: { fontSize: 24, fontWeight: 'bold', color: Colors.accent },
  body: { flex: 1, flexDirection: 'row' },
  
  menuContainer: { flex: 2, borderRightWidth: 1, borderRightColor: Colors.border, padding: 8 },
  cartContainer: { flex: 1, padding: 8, backgroundColor: Colors.surfaceRaised },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textSecondary, marginBottom: 12, marginLeft: 4 },
  
  productCard: {
    flex: 1, backgroundColor: Colors.surface, margin: 4, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border
  },
  productDisabled: { opacity: 0.5 },
  productName: { color: Colors.textPrimary, fontWeight: 'bold', marginBottom: 4 },
  productPrice: { color: Colors.accent, fontSize: 12 },
  outOfStock: { color: Colors.warn, fontSize: 10, marginTop: 4, fontWeight: 'bold' },

  cartItem: { backgroundColor: Colors.surface, padding: 12, borderRadius: 8, marginBottom: 8 },
  cartItemSent: { opacity: 0.8, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  cartItemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cartItemName: { color: Colors.textPrimary, fontWeight: '600', flex: 1 },
  cartItemPrice: { color: Colors.textPrimary, fontWeight: 'bold' },
  cartItemSub: { color: Colors.textSecondary, fontSize: 12 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: 'bold', marginTop: 8 },
  badgePending: { backgroundColor: Colors.warn, color: Colors.bg },
  badgeSent: { backgroundColor: Colors.ok, color: Colors.bg },
  emptyCartText: { color: Colors.textSecondary, textAlign: 'center', marginTop: 40 },

  actionFooter: { marginTop: 16, gap: 8 },
  sendKotBtn: { backgroundColor: Colors.warn, padding: 16, borderRadius: 8, alignItems: 'center' },
  billBtn: { backgroundColor: Colors.accent, padding: 16, borderRadius: 8, alignItems: 'center' },
  payBtn: { backgroundColor: Colors.ok, padding: 16, borderRadius: 8, alignItems: 'center' },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryBtnHalf: {
    width: '48%',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnFull: {
    width: '100%',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtn: { backgroundColor: Colors.surface, padding: 16, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  secondaryBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: Colors.bg, fontWeight: 'bold', fontSize: 16 },
  cancelRequestBox: { marginTop: 8, padding: 8, backgroundColor: '#ffe6e6', borderRadius: 8, borderWidth: 1, borderColor: Colors.warn },
  cancelReason: { fontSize: 12, color: Colors.warn, marginBottom: 8, fontWeight: 'bold' },
  cancelActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, flex: 1, alignItems: 'center' },
  cancelBtnText: { color: Colors.bg, fontWeight: 'bold', fontSize: 12 },

  // Modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surfaceRaised, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
  modalSub: { fontSize: 14, color: Colors.textSecondary, marginBottom: 8, marginTop: 12 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.textPrimary, fontSize: 14 },
  chipTextSelected: { color: Colors.bg, fontWeight: 'bold' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginVertical: 20, gap: 20 },
  qtyBtn: { backgroundColor: Colors.textSecondary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  qtyText: { color: Colors.textPrimary, fontSize: 24, fontWeight: 'bold' },
  notesInput: { backgroundColor: Colors.bg, color: Colors.textPrimary, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, fontSize: 16, marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancelBtn: { padding: 12 },
  modalCancelBtnText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  addBtn: { backgroundColor: Colors.accent, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  addBtnText: { color: Colors.bg, fontSize: 16, fontWeight: 'bold' },
  totalPayText: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
});
